/**
 * WeChat Channels (视频号) video decryption.
 *
 * Wraps the vendored Emscripten port at js/vendor/wasm_video_decode.js
 * (MIT, from Evil0ctal/WeChat-Channels-Video-File-Decryption) which loads
 * the Tencent official WASM module v1.2.46. Only first 128 KB of each MP4
 * is encrypted; the rest is plaintext copied through unchanged.
 *
 * The decoder is lazy-loaded on first use to avoid paying the 3.6 MB WASM
 * fetch on every page load.
 */

(() => {
  const KEYSTREAM_SIZE = 131072;
  const VENDOR_SCRIPT = 'js/vendor/wasm_video_decode.js';
  const WASM_URL = 'assets/wasm/wasm_video_decode.wasm';

  let keystream = null;
  let moduleReady = null;

  function waitForModule(timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (typeof window.Module !== 'undefined' && window.Module && window.Module.WxIsaac64) {
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('视频解密模块加载超时'));
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  function injectVendorScript() {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-channels-decoder="1"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') resolve();
        else {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject(new Error('解密脚本加载失败')));
        }
        return;
      }
      window.wasm_isaac_generate = (ptr, size) => {
        const wasmArray = new Uint8Array(window.Module.HEAPU8.buffer, ptr, size);
        keystream = new Uint8Array(size);
        keystream.set(wasmArray.slice().reverse());
      };
      window.VTS_WASM_URL = WASM_URL;
      const script = document.createElement('script');
      script.src = VENDOR_SCRIPT;
      script.async = true;
      script.dataset.channelsDecoder = '1';
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); });
      script.addEventListener('error', () => reject(new Error('解密脚本加载失败')));
      document.head.appendChild(script);
    });
  }

  async function ensureModule() {
    if (moduleReady) return moduleReady;
    moduleReady = (async () => {
      await injectVendorScript();
      await waitForModule();
    })();
    return moduleReady;
  }

  async function generateKeystream(decodeKey) {
    await ensureModule();
    keystream = null;
    const decryptor = new window.Module.WxIsaac64(String(decodeKey));
    try {
      await decryptor.generate(KEYSTREAM_SIZE);
    } finally {
      try { decryptor.delete(); } catch {}
    }
    if (!keystream) throw new Error('密钥流生成失败');
    return keystream;
  }

  function xorDecrypt(encrypted, keystreamBytes) {
    const out = new Uint8Array(encrypted.length);
    const decryptLen = Math.min(keystreamBytes.length, encrypted.length);
    for (let i = 0; i < decryptLen; i += 1) {
      out[i] = encrypted[i] ^ keystreamBytes[i];
    }
    if (encrypted.length > decryptLen) {
      out.set(encrypted.slice(decryptLen), decryptLen);
    }
    return out;
  }

  async function decryptChannelsMp4(encryptedBytes, decodeKey) {
    if (!(encryptedBytes instanceof Uint8Array) && !(encryptedBytes instanceof ArrayBuffer)) {
      throw new Error('decryptChannelsMp4 expects Uint8Array or ArrayBuffer');
    }
    const bytes = encryptedBytes instanceof Uint8Array ? encryptedBytes : new Uint8Array(encryptedBytes);
    if (!decodeKey) throw new Error('缺少 decode_key');
    const keystreamBytes = await generateKeystream(decodeKey);
    return xorDecrypt(bytes, keystreamBytes);
  }

  window.ChannelsDecoder = { decryptChannelsMp4, ensureModule };
})();

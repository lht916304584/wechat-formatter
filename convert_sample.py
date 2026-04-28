import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = None
end = None
for i, line in enumerate(lines):
    if 'cm.setValue(`' in line:
        start = i
    if start is not None and '`;' in line:
        end = i
        break

print(f'Template string from line {start+1} to {end+1}')

first = lines[start]
first = first.replace('cm.setValue(', '').strip()
if first.startswith('`'):
    first = first[1:]

last = lines[end]
last = last.split('`;')[0].rstrip() + '\n'

content_lines = [first] + lines[start+1:end] + [last]

output = ['    cm.setValue([']
for line in content_lines:
    text = line.rstrip('\n').replace("'", "\\'")
    output.append(f"      '{text}',")
output.append("    ].join('\\n'));")

with open('js/sample_array.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(output))

print('Generated array format')
print('First 5 lines:')
print('\n'.join(output[:5]))
print('Last 5 lines:')
print('\n'.join(output[-5:]))

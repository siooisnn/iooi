"""Make a new DOCX in memory, preserving ZIP parts and existing text styles."""
import io
import json
import sys
import zipfile
from pathlib import Path
from xml.dom import minidom

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
source = Path(sys.argv[1])
assert source.stat().st_size <= 10 * 1024 * 1024
replacements = json.loads(sys.argv[2])
assert isinstance(replacements, list) and 0 < len(replacements) <= 100
with zipfile.ZipFile(source) as archive:
    assert sum(part.file_size for part in archive.infolist()) <= 50 * 1024 * 1024
    documents = {name: minidom.parseString(archive.read(name)) for name in archive.namelist() if name.startswith('word/') and name.endswith('.xml') and ('document.xml' in name or 'header' in name or 'footer' in name)}
    for change in replacements:
        old, new = change['old_text'], change['new_text']
        assert isinstance(old, str) and old and isinstance(new, str)
        matches = []
        for name, document in documents.items():
            for paragraph in document.getElementsByTagNameNS(W, 'p'):
                nodes = list(paragraph.getElementsByTagNameNS(W, 't'))
                text = ''.join(''.join(child.data for child in node.childNodes if child.nodeType == child.TEXT_NODE) for node in nodes)
                for index in range(len(text)):
                    if text.startswith(old, index):
                        matches.append((name, nodes, index, index + len(old)))
        assert len(matches) == 1, 'Text must match exactly once in a paragraph'
        _, nodes, start, end = matches[0]
        offset = 0
        inserted = False
        for node in nodes:
            value = ''.join(child.data for child in node.childNodes if child.nodeType == child.TEXT_NODE)
            stop = offset + len(value)
            if offset < end and stop > start:
                replacement = value[:max(0, start - offset)] + (new if not inserted else '') + value[max(0, end - offset):]
                for child in list(node.childNodes):
                    node.removeChild(child)
                node.appendChild(node.ownerDocument.createTextNode(replacement))
                node.setAttribute('xml:space', 'preserve')
                inserted = True
            offset = stop
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as result:
        for part in archive.infolist():
            content = documents[part.filename].toxml(encoding='utf-8') if part.filename in documents else archive.read(part.filename)
            result.writestr(part, content)
    sys.stdout.buffer.write(output.getvalue())

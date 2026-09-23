import test from 'node:test';import assert from 'node:assert/strict';
import {encodeGrid,decodeGrid} from '../src/modules/medio-prazo/clipboard';
test('TSV preserva anotações multilinha, aspas e tabulações',()=>{const rows=[['Frente','Primeira linha\nSegunda "linha"'],['Outra','com\ttabulação']];assert.deepEqual(decodeGrid(encodeGrid(rows)),rows);});
test('aceita CRLF final e rejeita lote irregular ou acima do limite',()=>{assert.deepEqual(decodeGrid('1\t2\r\n3\t4\r\n'),[['1','2'],['3','4']]);assert.throws(()=>decodeGrid('1\t2\n3'),/retangular/);assert.throws(()=>decodeGrid('1\t2',1),/Limite/);assert.throws(()=>decodeGrid('"ab'),/aspas/);});

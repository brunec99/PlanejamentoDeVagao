import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Plane, Vector3 } from 'three';
import { createSectionController, DEFAULT_SECTION_CUT, sectionBounds, sectionPlaneDefinition, type SectionCut } from '../src/modules/ifc/section-plane';

const bounds = { min: { x: -20, y: -4, z: 10 }, max: { x: 60, y: 12, z: 50 } };
const cut = (changes: Partial<SectionCut> = {}): SectionCut => ({ ...DEFAULT_SECTION_CUT, enabled: true, ...changes });
const planeFor = (section: SectionCut) => {
  const definition = sectionPlaneDefinition(bounds, section);
  assert.ok(definition, 'A caixa válida com corte ativo precisa produzir um plano.');
  return new Plane(new Vector3(...definition.normal), definition.constant);
};

test('corte desativado não produz plano de seccionamento', () => {
  assert.equal(DEFAULT_SECTION_CUT.enabled, false);
  assert.equal(sectionPlaneDefinition(bounds, cut({ enabled: false })), undefined);
});

test('seccionamento nos três eixos preserva o lado inferior e atravessa a posição proporcional da caixa', () => {
  for (const axis of ['x', 'y', 'z'] as const) {
    const plane = planeFor(cut({ axis, position: 25 }));
    const location = bounds.min[axis] + (bounds.max[axis] - bounds.min[axis]) / 4;
    const onPlane = new Vector3(7, 3, 23).setComponent({ x: 0, y: 1, z: 2 }[axis], location);
    const below = onPlane.clone(); below[axis] -= 1;
    const above = onPlane.clone(); above[axis] += 1;
    assert.equal(plane.distanceToPoint(onPlane), 0);
    assert.ok(plane.distanceToPoint(below) > 0, `${axis}: lado inferior deve permanecer visível`);
    assert.ok(plane.distanceToPoint(above) < 0, `${axis}: lado superior deve ser recortado`);
    assert.equal(plane.normal.length(), 1);
  }
});

test('inverter o corte mantém a posição e troca o lado visível em cada eixo', () => {
  for (const axis of ['x', 'y', 'z'] as const) {
    const normal = planeFor(cut({ axis, position: 37 }));
    const inverted = planeFor(cut({ axis, position: 37, inverted: true }));
    const points = [new Vector3(-30, -12, -10), new Vector3(90, 30, 80)];
    for (const point of points) {
      assert.equal(inverted.distanceToPoint(point), -normal.distanceToPoint(point));
    }
  }
});

test('posição do corte respeita coordenadas negativas e os extremos da caixa', () => {
  const negativeCut = planeFor(cut({ axis: 'x', position: 12.5 }));
  assert.equal(negativeCut.distanceToPoint(new Vector3(-10, 0, 0)), 0);
  assert.ok(negativeCut.distanceToPoint(new Vector3(-15, 0, 0)) > 0);
  assert.ok(negativeCut.distanceToPoint(new Vector3(-5, 0, 0)) < 0);

  const minimum = planeFor(cut({ axis: 'x', position: 0 }));
  const maximum = planeFor(cut({ axis: 'x', position: 100 }));
  assert.equal(minimum.distanceToPoint(new Vector3(bounds.min.x, 0, 0)), 0);
  assert.equal(maximum.distanceToPoint(new Vector3(bounds.max.x, 0, 0)), 0);
  assert.ok(minimum.distanceToPoint(new Vector3(0, 0, 0)) < 0);
  assert.ok(maximum.distanceToPoint(new Vector3(0, 0, 0)) > 0);
});

test('caixas vazias ou coordenadas inválidas não chegam ao renderer', () => {
  const empty = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  assert.equal(sectionPlaneDefinition(empty, cut()), undefined);
  assert.equal(sectionPlaneDefinition({ ...bounds, max: { ...bounds.max, y: -5 } }, cut({ axis: 'x' })), undefined);
  assert.equal(sectionPlaneDefinition({ ...bounds, min: { ...bounds.min, z: NaN } }, cut({ axis: 'x' })), undefined);
  assert.equal(sectionPlaneDefinition(bounds, cut({ position: NaN })), undefined);
  assert.equal(sectionPlaneDefinition(bounds, cut({ position: Infinity })), undefined);
});

test('posição fora do intervalo é limitada às extremidades da geometria', () => {
  assert.deepEqual(sectionPlaneDefinition(bounds, cut({ position: -10 })), sectionPlaneDefinition(bounds, cut({ position: 0 })));
  assert.deepEqual(sectionPlaneDefinition(bounds, cut({ position: 120 })), sectionPlaneDefinition(bounds, cut({ position: 100 })));
});

test('a federação usa uma caixa global e envia o mesmo plano aos dois modelos', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const first = { box: new Box3(new Vector3(-10, -4, 0), new Vector3(0, 4, 10)), getClippingPlanesEvent: () => [] as Plane[] };
  const second = { box: new Box3(new Vector3(20, 10, 10), new Vector3(30, 20, 30)), getClippingPlanesEvent: () => [] as Plane[] };
  const callbacks = [first.getClippingPlanesEvent, second.getClippingPlanesEvent];
  const models = [{ model: first }, { model: second }];
  const renderer = { clippingPlanes: [] as Plane[] };
  const controller = createSectionController({ three: { Plane, Vector3 }, renderer }, { models, fragments: { settings: { maxUpdateRate: 100 }, update: async () => {} } }, sectionBounds(models), cause => { throw cause; });
  controller.set(cut({ axis: 'x', position: 50 }));
  assert.equal(renderer.clippingPlanes.length, 1);
  const plane = renderer.clippingPlanes[0];
  assert.equal(plane.distanceToPoint(new Vector3(10, 5, 5)), 0, 'Meio de -10 até 30, sem recentralizar cada modelo.');
  assert.strictEqual(first.getClippingPlanesEvent(), renderer.clippingPlanes);
  assert.strictEqual(second.getClippingPlanesEvent(), renderer.clippingPlanes);
  controller.set(DEFAULT_SECTION_CUT);
  assert.deepEqual(first.getClippingPlanesEvent(), []);
  assert.deepEqual(second.getClippingPlanesEvent(), []);
  controller.dispose();
  assert.strictEqual(first.getClippingPlanesEvent, callbacks[0]);
  assert.strictEqual(second.getClippingPlanesEvent, callbacks[1]);
  assert.deepEqual(renderer.clippingPlanes, []);
});

test('arraste rápido entrega a última posição ao worker e desmontagem cancela atualizações', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const renderer = { clippingPlanes: [] as Plane[] };
  const received: number[] = [];
  let finish: (() => void) | undefined;
  const controller = createSectionController({ three: { Plane, Vector3 }, renderer }, {
    models: [], fragments: { settings: { maxUpdateRate: 100 }, update: async () => {
      received.push(renderer.clippingPlanes[0]?.constant ?? NaN);
      await new Promise<void>(resolve => { finish = resolve; });
    } },
  }, bounds, cause => { throw cause; });
  controller.set(cut({ axis: 'x', position: 25 }));
  context.mock.timers.tick(50);
  controller.set(cut({ axis: 'x', position: 50 }));
  context.mock.timers.tick(100);
  assert.deepEqual(received, []);
  context.mock.timers.tick(1);
  assert.deepEqual(received, [20]);
  // Outra mudança durante a operação precisa de atualização final após ela terminar.
  controller.set(cut({ axis: 'x', position: 75 }));
  context.mock.timers.tick(101);
  assert.deepEqual(received, [20]);
  finish!(); await Promise.resolve(); await Promise.resolve();
  context.mock.timers.tick(101);
  assert.deepEqual(received, [20, 40]);
  controller.set(cut({ axis: 'x', position: 100 }));
  controller.dispose();
  finish!(); await Promise.resolve(); await Promise.resolve();
  context.mock.timers.tick(1000);
  assert.deepEqual(received, [20, 40]);
  assert.deepEqual(renderer.clippingPlanes, []);
});

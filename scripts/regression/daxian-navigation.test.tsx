import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TimeNav, {
  buildSiHuaOverlay,
  getInitialDaXianIndex,
  moveDaXianSelection,
} from '../../components/TimeNav';
import PalaceCell from '../../components/PalaceCell';
import { generateChart } from '../../lib/ziwei/algorithm';
import { STEMS } from '../../lib/ziwei/constants';

Object.assign(globalThis, { React });

function findElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement) => boolean,
): React.ReactElement[] {
  if (!React.isValidElement(node)) return [];
  const found = predicate(node) ? [node] : [];
  const props = node.props as { children?: React.ReactNode };
  for (const child of React.Children.toArray(props.children)) {
    found.push(...findElements(child, predicate));
  }
  return found;
}

const chart = generateChart({ year: 1990, month: 6, day: 15, hour: 4, gender: 'male' });
assert.ok(chart.daXians.length === 12);
assert.equal(getInitialDaXianIndex(chart), chart.currentDaXianIndex);
assert.equal(getInitialDaXianIndex({ ...chart, currentDaXianIndex: -1 }), 0,
  'childhood or out-of-range charts must not keep an invalid selected index');
assert.equal(getInitialDaXianIndex({ ...chart, daXians: [] }), -1);

assert.equal(moveDaXianSelection(chart, 0, -1), 0, 'first limit must clamp at the beginning');
assert.equal(moveDaXianSelection(chart, 11, 1), 11, 'last limit must clamp at the end');
assert.equal(moveDaXianSelection(chart, 3, 1), 4);
assert.equal(moveDaXianSelection(chart, 3, -1), 2);
assert.equal(moveDaXianSelection({ ...chart, daXians: [] }, 0, 1), -1);

const selectedIndex = (chart.currentDaXianIndex + 1) % chart.daXians.length;
let selected = -1;
let view = '';
const props = {
  chart,
  view: 'mingpan' as const,
  liunianYear: 2026,
  selectedDaXianIndex: selectedIndex,
  onViewChange: (next: string) => { view = next; },
  onYearChange: () => {},
  onDaXianChange: (index: number) => { selected = index; },
};

const tree = TimeNav(props);
const select = findElements(tree, element => element.props['aria-label'] === '选择大限')[0];
assert.ok(select, 'the native select provides direct access to all twelve limits');
select.props.onClick();
select.props.onChange({ target: { value: String(selectedIndex) } });
assert.equal(view, 'daxian');
assert.equal(selected, selectedIndex);

const nextButton = findElements(tree, element => element.props['aria-label'] === '下一限')[0];
nextButton.props.onClick();
assert.equal(selected, moveDaXianSelection(chart, selectedIndex, 1));

const lastTree = TimeNav({ ...props, selectedDaXianIndex: chart.daXians.length - 1 });
assert.equal(findElements(lastTree, element => element.props['aria-label'] === '下一限')[0].props.disabled, true);
const firstTree = TimeNav({ ...props, selectedDaXianIndex: 0 });
assert.equal(findElements(firstTree, element => element.props['aria-label'] === '上一限')[0].props.disabled, true);

const html = renderToStaticMarkup(<TimeNav {...props} view="daxian" />);
assert.equal((html.match(/<option/g) ?? []).length, 12);
const dx = chart.daXians[selectedIndex];
const palace = chart.palaces.find(item => item.branch === dx.palaceBranch);
assert.ok(palace);
assert.ok(html.includes(`大限·${dx.palaceName}${STEMS[palace.stem]}宫四化`));
const overlay = buildSiHuaOverlay(palace.stem);
for (const [star, siHua] of Object.entries(overlay)) {
  assert.ok(html.includes(`${star}化${siHua}`), `selected limit overlay must include ${star} ${siHua}`);
}

const selectedPalaceHtml = renderToStaticMarkup(
  <PalaceCell palace={palace} isDaXianView isSelectedDaXian />,
);
assert.ok(selectedPalaceHtml.includes('data-daxian-selected="true"'));
const currentPalace = chart.palaces.find(item => item.isCurrentDaXian);
if (currentPalace && currentPalace.branch !== palace.branch) {
  const currentHtml = renderToStaticMarkup(
    <PalaceCell palace={currentPalace} isDaXianView isSelectedDaXian={false} />,
  );
  assert.ok(!currentHtml.includes('data-daxian-current="true"'),
    'the real current palace must not remain emphasized while another limit is selected');
}

console.log('DaXian direct selection, previous/next, boundaries, overlays and palace highlighting passed');

'use client';
import { motion } from 'framer-motion';
import { STEMS, SI_HUA_TABLE } from '@/lib/ziwei/constants';
import type { ZiweiChart } from '@/lib/ziwei/types';

export type TimeView = 'mingpan' | 'daxian' | 'liunian';

interface TimeNavProps {
  chart: ZiweiChart;
  view: TimeView;
  liunianYear: number;
  selectedDaXianIndex: number;
  onViewChange: (view: TimeView) => void;
  onYearChange: (year: number) => void;
  onDaXianChange: (index: number) => void;
}

/** 由年份计算天干索引 (0-9) */
export function getYearStemIndex(year: number): number {
  return ((year - 4) % 10 + 10) % 10;
}

/** 根据天干索引返回四化映射：starName → SiHua */
export function buildSiHuaOverlay(stemIndex: number): Record<string, string> {
  const stars = SI_HUA_TABLE[stemIndex];
  if (!stars) return {};
  return {
    [stars[0]]: '禄',
    [stars[1]]: '权',
    [stars[2]]: '科',
    [stars[3]]: '忌',
  };
}

export function getInitialDaXianIndex(chart: ZiweiChart): number {
  if (chart.currentDaXianIndex >= 0 && chart.currentDaXianIndex < chart.daXians.length) {
    return chart.currentDaXianIndex;
  }
  return chart.daXians.length > 0 ? 0 : -1;
}

export function moveDaXianSelection(
  chart: ZiweiChart,
  selectedIndex: number,
  offset: number,
): number {
  if (!chart.daXians.length) return -1;
  const safeIndex = selectedIndex >= 0 && selectedIndex < chart.daXians.length
    ? selectedIndex
    : getInitialDaXianIndex(chart);
  return Math.max(0, Math.min(chart.daXians.length - 1, safeIndex + offset));
}

const SIHUA_COLORS: Record<string, string> = {
  '禄': '#4ade80',
  '权': '#60a5fa',
  '科': '#facc15',
  '忌': '#f87171',
};

export default function TimeNav({
  chart,
  view,
  liunianYear,
  selectedDaXianIndex,
  onViewChange,
  onYearChange,
  onDaXianChange,
}: TimeNavProps) {
  const selectedDx = chart.daXians[selectedDaXianIndex];
  const selectedDxPalace = selectedDx
    ? chart.palaces.find(p => p.branch === selectedDx.palaceBranch)
    : undefined;

  const getOverlayInfo = (): { stemName: string; overlay: Record<string, string> } | null => {
    if (view === 'mingpan') return null;

    if (view === 'daxian' && selectedDxPalace) {
      const stemIndex = selectedDxPalace.stem;
      return {
        stemName: STEMS[stemIndex],
        overlay: buildSiHuaOverlay(stemIndex),
      };
    }

    if (view === 'liunian') {
      const stemIndex = getYearStemIndex(liunianYear);
      return {
        stemName: STEMS[stemIndex],
        overlay: buildSiHuaOverlay(stemIndex),
      };
    }

    return null;
  };

  const overlayInfo = getOverlayInfo();
  const changeDaXian = (index: number) => {
    if (index < 0 || index >= chart.daXians.length) return;
    onDaXianChange(index);
    if (view !== 'daxian') onViewChange('daxian');
  };

  return (
    <div className="mb-3">
      {/* Tab 行 */}
      <div
        className="flex items-center rounded-xl p-1 gap-1"
        style={{ background: 'var(--t-surface)', border: '1px solid var(--t-border)' }}
      >
        {/* 本命 */}
        <TabButton
          active={view === 'mingpan'}
          onClick={() => onViewChange('mingpan')}
        >
          本命
        </TabButton>

        {/* 大限 — 下拉直选 + 前后切换 */}
        <div
          className="relative flex-1 flex items-center justify-center rounded-lg py-1.5 gap-0.5 transition-all duration-200 min-w-0"
          style={{
            background: view === 'daxian' ? 'rgba(212,168,67,0.12)' : 'transparent',
            border: view === 'daxian' ? '1px solid rgba(212,168,67,0.25)' : '1px solid transparent',
          }}
        >
          <button
            type="button"
            aria-label="上一限"
            title="上一限"
            disabled={selectedDaXianIndex <= 0}
            onClick={() => changeDaXian(moveDaXianSelection(chart, selectedDaXianIndex, -1))}
            className="text-[11px] w-4 h-4 flex items-center justify-center rounded disabled:opacity-20"
            style={{ color: 'var(--t-faint)', flexShrink: 0 }}
          >
            ‹
          </button>
          <select
            aria-label="选择大限"
            title="选择大限"
            value={selectedDaXianIndex}
            disabled={!chart.daXians.length}
            onClick={() => { if (view !== 'daxian') onViewChange('daxian'); }}
            onChange={e => changeDaXian(Number(e.target.value))}
            className="min-w-0 flex-1 cursor-pointer bg-transparent text-[10px] font-medium text-center outline-none"
            style={{
              color: view === 'daxian' ? 'var(--t-gold)' : 'var(--t-faint)',
              textAlign: 'center',
            }}
          >
            {chart.daXians.length === 0 && <option value={-1}>大限</option>}
            {chart.daXians.map((dx, index) => (
              <option
                key={`${dx.startAge}-${dx.endAge}-${dx.palaceBranch}`}
                value={index}
                style={{ background: 'var(--t-bg)', color: 'var(--t-text)' }}
              >
                大限 {dx.startAge}–{dx.endAge}岁 · {dx.palaceName}{index === chart.currentDaXianIndex ? '（当前）' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="下一限"
            title="下一限"
            disabled={selectedDaXianIndex < 0 || selectedDaXianIndex >= chart.daXians.length - 1}
            onClick={() => changeDaXian(moveDaXianSelection(chart, selectedDaXianIndex, 1))}
            className="text-[11px] w-4 h-4 flex items-center justify-center rounded disabled:opacity-20"
            style={{ color: 'var(--t-faint)', flexShrink: 0 }}
          >
            ›
          </button>
        </div>

        {/* 流年 — 含年份切换 */}
        <div
          className="relative flex-1 flex items-center justify-center rounded-lg py-1.5 gap-1 transition-all duration-200"
          style={{
            background: view === 'liunian'
              ? 'rgba(212,168,67,0.12)'
              : 'transparent',
            border: view === 'liunian'
              ? '1px solid rgba(212,168,67,0.25)'
              : '1px solid transparent',
          }}
        >
          <button
            onClick={() => onViewChange('liunian')}
            className="text-[10px] font-medium flex-1 text-center"
            style={{ color: view === 'liunian' ? 'var(--t-gold)' : 'var(--t-faint)' }}
          >
            流年
          </button>
          <div className="flex items-center gap-0.5">
            <button
              aria-label="上一年"
              onClick={e => { e.stopPropagation(); onYearChange(liunianYear - 1); if (view !== 'liunian') onViewChange('liunian'); }}
              className="text-[9px] w-4 h-4 flex items-center justify-center rounded"
              style={{ color: 'var(--t-faint)' }}
            >
              ‹
            </button>
            <span
              className="text-[10px] font-mono min-w-[28px] text-center cursor-pointer"
              style={{ color: view === 'liunian' ? 'var(--t-gold)' : 'var(--t-faint)' }}
              onClick={() => onViewChange('liunian')}
            >
              {liunianYear}
            </span>
            <button
              aria-label="下一年"
              onClick={e => { e.stopPropagation(); onYearChange(liunianYear + 1); if (view !== 'liunian') onViewChange('liunian'); }}
              className="text-[9px] w-4 h-4 flex items-center justify-center rounded"
              style={{ color: 'var(--t-faint)' }}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* 叠加四化说明行 */}
      {overlayInfo && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2 mt-1.5 px-1 flex-wrap"
        >
          <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>
            {view === 'daxian'
              ? `大限·${selectedDx?.palaceName ?? ''}${overlayInfo.stemName}宫四化：`
              : `${liunianYear}·${overlayInfo.stemName}年四化：`}
          </span>
          {(['禄', '权', '科', '忌'] as const).map(sh => {
            const starName = Object.keys(overlayInfo.overlay).find(k => overlayInfo.overlay[k] === sh);
            if (!starName) return null;
            return (
              <span key={sh} className="text-[9px] font-medium" style={{ color: SIHUA_COLORS[sh] }}>
                {starName}化{sh}
              </span>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1.5 text-[10px] font-medium rounded-lg transition-all duration-200"
      style={{
        background: active ? 'rgba(212,168,67,0.12)' : 'transparent',
        color: active ? 'var(--t-gold)' : 'var(--t-faint)',
        border: active ? '1px solid rgba(212,168,67,0.25)' : '1px solid transparent',
      }}
    >
      {children}
    </button>
  );
}

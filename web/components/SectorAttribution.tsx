import React from 'react';
import { useTranslations } from 'next-intl';

interface SectorStat {
  impact: number;
  weight: number;
}

interface Props {
  data: Record<string, SectorStat>;
}

export function SectorAttribution({ data }: Props) {
  const t = useTranslations('Funds');
  
  if (!data || Object.keys(data).length === 0) return null;

  // Convert to array and sort by absolute impact (drivers) or signed impact?
  // Usually signed impact is better to separate Winners vs Losers.
  // Let's sort by Impact DESC.
  const sectors = Object.entries(data)
    .map(([name, stat]) => ({ name, ...stat }))
    .sort((a, b) => b.impact - a.impact);

  // Find max value for scaling bars
  const maxImpact = Math.max(...sectors.map(s => Math.abs(s.impact)), 0.01);

  return (
    <div className="mt-6 border-t border-slate-800/50 pt-4">
      <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
        <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
        {t('sectorAttribution')} 
        <span className="text-xs font-normal text-slate-500 ml-auto">
          {t('byShenwanL1')}
        </span>
      </h3>
      
      <div className="space-y-2">
        {sectors.map((sector) => (
          <div key={sector.name} className="group flex items-center text-xs hover:bg-slate-800/30 p-1 rounded transition-colors">
            {/* Name & Weight */}
            <div className="w-24 shrink-0">
              <div className="font-medium text-slate-200">{sector.name}</div>
              <div className="text-[10px] text-slate-500">{sector.weight.toFixed(2)}%</div>
            </div>
            
            {/* Bar Chart Area */}
            <div className="flex-1 px-3 flex items-center justify-center relative h-6">
               {/* Center Line */}
               <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-700"></div>
               
               {/* Bar */}
               <div className="w-full flex">
                 {/* Negative Side (Right aligned) */}
                 <div className="flex-1 flex justify-end">
                    {sector.impact < 0 && (
                        <div 
                          className="h-3 bg-emerald-500/80 rounded-l-sm transition-all"
                          style={{ width: `${(Math.abs(sector.impact) / maxImpact) * 100}%` }}
                        ></div>
                    )}
                 </div>
                 
                 {/* Positive Side (Left aligned) */}
                 <div className="flex-1 flex justify-start">
                    {sector.impact > 0 && (
                        <div 
                          className="h-3 bg-rose-500/80 rounded-r-sm transition-all"
                          style={{ width: `${(sector.impact / maxImpact) * 100}%` }}
                        ></div>
                    )}
                 </div>
               </div>
            </div>
            
            {/* Value */}
            <div className={`w-16 shrink-0 text-right font-mono font-bold ${sector.impact >= 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {sector.impact > 0 ? '+' : ''}{sector.impact.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

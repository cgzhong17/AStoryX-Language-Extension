import { Analysis, parameterInfo, protection } from './core';

export const HIGHLIGHT_COLORS = {
  speaker: 'astoryx.speakerForeground',
  dialogue: 'astoryx.dialogueForeground',
  character: 'astoryx.characterForeground',
  controller: 'astoryx.characterForeground',
  narration: 'astoryx.narrationForeground',
  parameter: 'astoryx.parameterForeground'
} as const;
export type HighlightRole = keyof typeof HIGHLIGHT_COLORS;
export interface HighlightSpan { line: number; start: number; end: number; role: HighlightRole }

/** Use parsed controller identity and ranges, so custom rules and protected text work too. */
export function highlightSpans(analysis: Analysis): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  const add = (line: number, start: number, end: number, role: HighlightRole) => {
    if (end > start) spans.push({line,start,end,role});
  };
  for (const [line, parsed] of analysis.parsed) {
    const required = parsed.segments[0];
    if (parsed.rule.id === 'Dialog') {
      const separator = parsed.rule.requiredParametersSeparator, {mask} = protection(required.value);
      let split = -1;
      if (separator) for (let i = 0; i < required.value.length; i++) {
        if (!mask[i] && required.value.startsWith(separator,i)) {split=i;break;}
      }
      if (split >= 0 && required.value.slice(0,split).trim()) {
        add(line,0,required.start+split,'speaker');
        add(line,required.start+split,required.start+split+separator.length,'parameter');
        add(line,required.start+split+separator.length,required.end,'dialogue');
      } else add(line,0,required.end,'narration');
    } else if (parsed.rule.id === 'Character' || parsed.rule.id === 'Interlude') {
      add(line,0,required.end,'character');
    } else if (parsed.rule.id === 'FreeText' || parsed.rule.id === 'Narration') {
      add(line,0,required.end,'narration');
    } else {
      if(parsed.headerEnd)add(line,0,parsed.headerEnd,'controller');
      continue;
    }

    // Neutral prefixes/numbers must not cover the theme's boolean keyword color.
    const optional = parsed.segments[1];
    if (optional) {
      let start=optional.prefixStart;
      for(const segment of parsed.segments.slice(1)) {
        if(parameterInfo(parsed.rule.id,segment.name)?.type!=='boolean'||!/^\s*(true|false)\s*$/i.test(segment.value))continue;
        const valueStart=segment.start+segment.value.search(/\S/),valueEnd=valueStart+segment.value.trim().length;
        add(line,start,valueStart,'parameter');
        start=valueEnd;
      }
      add(line,start,analysis.lines[line].length,'parameter');
    }
  }
  return spans;
}

// Graphics for plans made before graphics were part of the plan (or lines that left it out):
// a sensible beat per scene kind, built only from what the plan already holds.
import type {Graphic, Item, Plan, PlanScene} from './types';

const g = (type: Graphic['type'], rest: Partial<Graphic> = {}): Graphic => ({type, kicker: '', title: '', items: [], lines: [], stamp: '', highlights: [], sourceId: '', ...rest});
const items = (xs: string[], tone: Item['tone'] = 'neutral'): Item[] => xs.map((label) => ({label, value: '', detail: '', tone}));
const day = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  return m ? `${+m[3]} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]}` : d;
};
export const longDay = (d: string) => (/^\d{4}-/.test(d) ? `${day(d)} ${d.slice(0, 4)}`.toUpperCase() : d);
const jargon = (title: string) => title.split(':')[0].trim();

export function autoGraphic(plan: Plan, scene: PlanScene, i: number): Graphic {
  const srcs = plan.sources.filter((s) => scene.sourceIds.includes(s.id));
  const pick = <T,>(xs: T[]) => xs[i % Math.max(1, xs.length)];
  const onScreen = scene.onScreen.length ? scene.onScreen : [scene.title];
  if (i > 0 && !['montage', 'warnings', 'developments'].includes(scene.kind) && i < onScreen.length) return g('continue');
  switch (scene.kind) {
    case 'hook':
      return g('title', {title: jargon(plan.title), kicker: onScreen.slice(0, 3).join(' · ')});
    case 'intro':
      return g('presenter', {items: items(['the news', `what is ${jargon(plan.title)}`, 'what you can do'])});
    case 'montage':
    case 'developments': {
      const q = plan.quotes.find((x) => x.sourceId === pick(srcs)?.id) || pick(plan.quotes);
      if (q && i % 2) {
        const s = plan.sources.find((x) => x.id === q.sourceId);
        return g('quote', {title: q.speaker, kicker: `QUOTE · VIA ${s?.outlet || ''} · ${longDay(q.date)}`, lines: [q.text], sourceId: q.sourceId});
      }
      return g('clippings', {title: 'COVERAGE', items: (srcs.length ? srcs : plan.sources).slice(0, 3).map((s) => ({label: s.outlet, value: longDay(s.date), detail: s.title, tone: 'neutral'}))});
    }
    case 'warnings': {
      const q = plan.quotes.find((x) => scene.sourceIds.includes(x.sourceId)) || pick(plan.quotes);
      return q ? g('quote', {title: q.speaker, kicker: `WARNING · ${longDay(q.date)}`, lines: [q.text]}) : g('cards', {kicker: 'WARNING', title: scene.title, items: items(onScreen, 'bad')});
    }
    case 'timeline':
      return g('timeline', {title: plan.asOf.slice(0, 4), items: [...srcs].sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({label: day(s.date), value: s.outlet, detail: '', tone: 'bad'}))});
    case 'risk':
      return g('cards', {kicker: 'WHO IS AT RISK', title: scene.title, items: items(onScreen, 'bad')});
    case 'midcta':
      return g('comment', {title: onScreen[0] || '?', items: items(onScreen.slice(1))});
    case 'fix':
      return g('checklist', {kicker: 'FIX', title: scene.title, items: items(onScreen, 'good')});
    case 'recap':
      return g('checklist', {kicker: 'CHECKLIST', title: jargon(plan.title), items: items(onScreen, 'good'), stamp: plan.newsLabel ? `UPDATED · ${longDay(plan.asOf)}` : ''});
    case 'helpcta':
      return i === 0 ? g('help', {items: items(['check', 'fix', 'upgrade']), lines: [`FIX · ${onScreen[0] || jargon(plan.title)}`], kicker: 'free · no paid service'}) : g('outro');
    default:
      return g('cards', {kicker: scene.title.toUpperCase().slice(0, 40), title: jargon(plan.title), items: items(onScreen)});
  }
}

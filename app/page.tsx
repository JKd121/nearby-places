import Link from "next/link";
import { ArrowRight, Compass, MapPin, SlidersHorizontal } from "lucide-react";
import { Button } from "../src/components/ui/button";
import { RecentHistory } from "../src/components/recent-history";

export default function Page() {
  return <div className="content-page home-page">
    <section className="home-intro"><div className="home-greeting"><span className="greeting-line" />把日常，走出一点不同</div><h1>下一处好地方，<br />从这里发现。</h1><p>选一个目的地，看看附近有什么。<br className="desktop-break" />把周末留给好奇心，把出发交给自己。</p><Button asChild><Link href="/explore">开始探索 <ArrowRight aria-hidden="true" /></Link></Button></section>
    <section className="home-field-note" aria-label="探索方式"><div className="field-note-heading"><Compass aria-hidden="true" /><span>一小段路，也值得期待。</span></div><div className="field-note-body"><p>不用规划整个周末。<br />先选一个想去的地方。</p><div className="field-note-rule" /><div className="field-note-detail"><MapPin aria-hidden="true" /><span>确认目的地，再发现周边</span></div><div className="field-note-detail"><SlidersHorizontal aria-hidden="true" /><span>组合类别，找到适合自己的去处</span></div></div></section>
    <div className="home-activity"><RecentHistory compact /></div>
    <footer className="home-footer"><span>附近，还有很多可能。</span><Link href="/my-places">认识你的地点空间 <ArrowRight aria-hidden="true" /></Link></footer>
  </div>;
}

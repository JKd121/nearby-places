import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "../src/components/ui/button";
import { RecentHistory } from "../src/components/recent-history";

export default function Page() {
  return <div className="content-page home-page">
    <section className="home-intro"><div><h1>探索你的下一站</h1><p>从一个目的地开始，查找附近的生活服务。</p></div><Button asChild><Link href="/explore">开始探索 <ArrowRight aria-hidden="true" /></Link></Button></section>
    <RecentHistory compact />
  </div>;
}

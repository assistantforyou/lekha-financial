import { PageHeader } from "@/components/common"
import AgentPanel from "@/components/AgentPanel"
export default function AgentPage({ item, route }) {
  const q = route.query ? route.query.get("q") : null
  return <div><PageHeader title={item.title} description={item.desc} /><AgentPanel initial={q} key={q || "blank"} /></div>
}

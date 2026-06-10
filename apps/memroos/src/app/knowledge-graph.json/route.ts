import { getUnderstandGraph, makeUnderstandJsonRoute } from "@/lib/understand-graph";

export const dynamic = "force-dynamic";

export const GET = makeUnderstandJsonRoute(getUnderstandGraph);

import { makeUnderstandRoute } from "@/lib/understand-graph";
import { UNDERSTAND_NOINDEX_HEADERS } from "@/lib/understand-policy";

export const dynamic = "force-dynamic";

export const GET = makeUnderstandRoute(() => {
  return new Response("Not available in the hosted graph.\n", {
    status: 404,
    headers: {
      ...UNDERSTAND_NOINDEX_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
});

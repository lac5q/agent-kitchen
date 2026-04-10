import { render, screen } from "@testing-library/react";
import { CollectionCard } from "@/components/library/collection-card";
import type { KnowledgeCollection } from "@/types";

function makeCollection(
  overrides: Partial<KnowledgeCollection> = {}
): KnowledgeCollection {
  return {
    name: "test-collection",
    docCount: 10,
    category: "other",
    lastUpdated: null,
    ...overrides,
  };
}

describe("CollectionCard freshness date", () => {
  it("renders freshness date when lastUpdated is present", () => {
    const fixture = makeCollection({ lastUpdated: "2026-04-01T12:00:00Z" });
    render(<CollectionCard collection={fixture} maxCount={100} />);

    const dateEl = screen.getByTitle("2026-04-01T12:00:00Z");
    expect(dateEl).toBeInTheDocument();
    // locale date string will contain digits — verify it has some date-like text
    expect(dateEl).toHaveTextContent(
      new Date("2026-04-01T12:00:00Z").toLocaleDateString()
    );
  });

  it("does not render date when lastUpdated is null", () => {
    const fixture = makeCollection({ lastUpdated: null });
    render(<CollectionCard collection={fixture} maxCount={100} />);

    // No element should have a title that looks like a year
    const dateEl = screen.queryByTitle(/^\d{4}/);
    expect(dateEl).toBeNull();
  });

  it("date element has title attribute with ISO string for hover", () => {
    const fixture = makeCollection({ lastUpdated: "2026-03-15T08:30:00Z" });
    render(<CollectionCard collection={fixture} maxCount={100} />);

    const dateEl = screen.getByTitle("2026-03-15T08:30:00Z");
    expect(dateEl.tagName).toBe("P");
    expect(dateEl).toHaveClass("text-xs");
  });
});

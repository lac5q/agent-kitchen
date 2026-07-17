import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../sheet";

describe("Sheet primitives", () => {
  it("renders trigger, content, and footer sections when open by default", () => {
    render(
      <Sheet defaultOpen>
        <SheetTrigger>Open sheet</SheetTrigger>
        <SheetContent side="left" showCloseButton={false}>
          <SheetHeader>
            <SheetTitle>Sheet title</SheetTitle>
            <SheetDescription>Sheet description</SheetDescription>
          </SheetHeader>
          <div>Sheet body</div>
          <SheetFooter>Sheet footer</SheetFooter>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByText("Open sheet")).toBeInTheDocument();
    expect(screen.getByText("Sheet title")).toBeInTheDocument();
    expect(screen.getByText("Sheet description")).toBeInTheDocument();
    expect(screen.getByText("Sheet body")).toBeInTheDocument();
    expect(screen.getByText("Sheet footer")).toBeInTheDocument();
    expect(screen.getByText("Open sheet")).toHaveAttribute("data-slot", "sheet-trigger");
    expect(screen.getByText("Sheet footer")).toHaveAttribute("data-slot", "sheet-footer");
  });

  it("renders a close control when showCloseButton is enabled", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Closable sheet</SheetTitle>
          <SheetClose data-testid="sheet-close">Dismiss</SheetClose>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByText("Closable sheet")).toBeInTheDocument();
    expect(screen.getByTestId("sheet-close")).toHaveAttribute("data-slot", "sheet-close");
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});

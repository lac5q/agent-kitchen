import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../tooltip";

describe("Tooltip primitives", () => {
  it("renders trigger and tooltip content when opened by default", () => {
    render(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip help</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByText("Hover me")).toBeInTheDocument();
    expect(screen.getByText("Tooltip help")).toBeInTheDocument();
  });

  it("keeps the trigger interactive for pointer events", () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Action</TooltipTrigger>
          <TooltipContent>Details</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByText("Action");
    fireEvent.mouseEnter(trigger);
    expect(trigger).toBeInTheDocument();
  });
});

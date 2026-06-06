import { fireEvent, render, screen } from "@testing-library/react";
import { Settings } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ControlSection } from "../components/ControlSection";

describe("ControlSection", () => {
  it("keeps controls collapsed until the section is opened", () => {
    render(
      <ControlSection title="Preferences" icon={<Settings />} summary="Drawing on">
        <button type="button">Viewer drawing</button>
      </ControlSection>
    );

    const trigger = screen.getByRole("button", { name: /preferences/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Viewer drawing" })).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Viewer drawing" })).toBeInTheDocument();
  });
});

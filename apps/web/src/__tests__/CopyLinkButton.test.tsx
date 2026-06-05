import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopyLinkButton } from "../components/CopyLinkButton";

describe("CopyLinkButton", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText }
    });
  });

  it("copies the invite URL", async () => {
    writeText.mockResolvedValue(undefined);
    render(<CopyLinkButton url="https://example.test/room/a8f4k2" />);

    fireEvent.click(screen.getByRole("button", { name: /copy invite link/i }));

    expect(writeText).toHaveBeenCalledWith("https://example.test/room/a8f4k2");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

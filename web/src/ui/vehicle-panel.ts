import { fr, modeLabel } from "../i18n/fr";
import type { VehicleDescription } from "../render/selection";
import { badgeInk } from "../theme/colors";
import { formatClock } from "../time/clock";

export interface VehiclePanel {
  show(description: VehicleDescription, following: boolean): void;
  hide(): void;
}

export interface VehiclePanelHandlers {
  onClose: () => void;
  onFollow: (follow: boolean) => void;
}

/**
 * The panel of the selected vehicle: route badge in its own colours, destination, next stop and
 * scheduled time (SCOPE.md, section 4.4). Worded for a layover and for an off-duty vehicle too.
 */
export function createVehiclePanel(
  parent: HTMLElement,
  handlers: VehiclePanelHandlers,
): VehiclePanel {
  const section = document.createElement("section");
  section.className = "vehicle";
  section.setAttribute("aria-live", "polite");
  section.hidden = true;

  const header = document.createElement("div");
  header.className = "vehicle__header";
  const badge = document.createElement("span");
  badge.className = "badge";
  const mode = document.createElement("span");
  mode.className = "vehicle__mode";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "vehicle__close";
  close.setAttribute("aria-label", fr.close);
  close.textContent = "×";
  close.addEventListener("click", handlers.onClose);
  const follow = document.createElement("button");
  follow.type = "button";
  follow.className = "toggle vehicle__follow";
  follow.textContent = fr.follow;
  follow.setAttribute("aria-pressed", "false");
  let following = false;
  follow.addEventListener("click", () => {
    handlers.onFollow(!following);
  });
  header.append(badge, mode, follow, close);

  const headsign = document.createElement("p");
  headsign.className = "vehicle__headsign";
  const next = document.createElement("p");
  next.className = "vehicle__next";
  const block = document.createElement("p");
  block.className = "vehicle__block";
  section.append(header, headsign, next, block);
  parent.append(section);

  return {
    show(description, isFollowing) {
      following = isFollowing;
      follow.setAttribute("aria-pressed", isFollowing ? "true" : "false");
      const { route } = description;
      badge.hidden = route === null;
      if (route !== null) {
        badge.textContent = route.name;
        badge.style.backgroundColor = `#${route.color}`;
        badge.style.color = `#${badgeInk(route)}`;
        mode.textContent = modeLabel(route.mode);
      } else {
        mode.textContent = "";
      }
      headsign.textContent =
        description.headsign === null ? fr.offDuty : `${fr.towards} ${description.headsign}`;
      if (description.status === "layover" && description.start !== null) {
        next.textContent = `${fr.layoverUntil} ${formatClock(description.start)}`;
      } else if (description.status === "running") {
        next.textContent =
          description.nextStop === null
            ? fr.terminus
            : `${fr.nextStop} ${description.nextStop.name} · ${formatClock(description.nextStop.time)}`;
      } else {
        next.textContent = "";
      }
      block.textContent = `${fr.vehicleBlock} ${description.block}`;
      section.hidden = false;
    },
    hide() {
      section.hidden = true;
    },
  };
}

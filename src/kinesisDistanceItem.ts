import {
  KinesisDistanceItemOptions,
  InteractionType,
  TransformType,
} from "./types";
import { getMousePositionDistance, clamp } from "./utils";

class KinesisDistanceItem {
  private element: HTMLElement;
  private options: Required<KinesisDistanceItemOptions>;
  private isActive: boolean;
  private initialTransform: string;
  private mouseX: number = 0;
  private mouseY: number = 0;
  private animationId: number | null = null;
  private duration: number;
  private easing: string;
  private readonly MIN_DISTANCE: number = 0.0001; // Avoid division by zero
  private minimumDistance: number;

  constructor(element: HTMLElement, options: KinesisDistanceItemOptions = {}) {
    if (!element.hasAttribute("data-kinesisdistance-item")) {
      throw new Error(
        "Element does not have the 'data-kinesisdistance-item' attribute."
      );
    }

    this.element = element;

    this.options = {
      active: options.active !== undefined ? options.active : true,
      strength: options.strength !== undefined ? options.strength : 20,
      transformOrigin: options.transformOrigin || "center",
      startDistance:
        options.startDistance !== undefined
          ? options.startDistance
          : parseInt(
              element.getAttribute("data-ks-startdistance") || "100",
              10
            ),
      interactionType:
        (options.interactionType as InteractionType) ||
        (element.getAttribute("data-ks-interaction") as InteractionType) ||
        "linear",
      transformType:
        (options.transformType as TransformType) ||
        (element.getAttribute("data-ks-transform") as TransformType) ||
        "translate",
    } as Required<KinesisDistanceItemOptions>;

    this.duration = parseInt(
      element.getAttribute("data-ks-duration") || "1000",
      10
    );
    this.easing =
      element.getAttribute("data-ks-easing") ||
      "cubic-bezier(0.23, 1, 0.32, 1)";

    this.isActive = this.options.active;

    // Get the minimumDistance from data attribute or default to 5
    this.minimumDistance = parseInt(
      element.getAttribute("data-ks-min-distance") || "5",
      10
    );

    const computedStyle = window.getComputedStyle(this.element);
    this.initialTransform =
      computedStyle.transform === "none" ? "" : computedStyle.transform;

    this.element.style.transformOrigin = this.options.transformOrigin;
    this.element.style.transform = this.initialTransform;
    this.element.style.transition = `transform ${this.duration}ms ${this.easing}`;

    if (this.isActive) {
      this.bindEvents();
    }
  }

  private bindEvents() {
    window.addEventListener("mousemove", this.onMouseMove);
    this.animate();
  }

  private onMouseMove = (event: MouseEvent) => {
    const pos = getMousePositionDistance(event);
    this.mouseX = pos.x;
    this.mouseY = pos.y;
  };

  private calculateDistance(): number {
    const rect = this.element.getBoundingClientRect();
    const elementX = rect.left + rect.width / 2;
    const elementY = rect.top + rect.height / 2;

    const dx = this.mouseX - elementX;
    const dy = this.mouseY - elementY;

    return Math.sqrt(dx * dx + dy * dy);
  }

  private getInteractionFactor(distance: number): number {
    const { interactionType, startDistance } = this.options;
    const normalizedDistance = clamp(distance / startDistance, 0, 1);

    switch (interactionType) {
      case "linear":
      case "attraction":
      case "repulsion":
        return 1 - normalizedDistance;
      default:
        return 1;
    }
  }

  private applyTransform() {
    const distance = this.calculateDistance();
    const { transformType, interactionType } = this.options;

    if (distance < this.options.startDistance) {
      let factor = this.getInteractionFactor(distance);
      let transformValue = "";

      const rect = this.element.getBoundingClientRect();
      const elementX = rect.left + rect.width / 2;
      const elementY = rect.top + rect.height / 2;

      const dx = this.mouseX - elementX;
      const dy = this.mouseY - elementY;

      const distanceNonZero = Math.max(distance, this.MIN_DISTANCE);
      const directionX = dx / distanceNonZero;
      const directionY = dy / distanceNonZero;

      switch (transformType) {
        case "translate":
          let translateX = 0;
          let translateY = 0;

          if (interactionType === "repulsion") {
            // Repulsion logic remains the same
            const movement = this.options.strength * factor;
            translateX = -directionX * movement;
            translateY = -directionY * movement;
          } else {
            // Attraction with minimum distance
            if (distance > this.minimumDistance) {
              // Calculate desired movement amount
              const movement = Math.min(
                this.options.strength * factor,
                distance - this.minimumDistance
              );
              translateX = directionX * movement;
              translateY = directionY * movement;
            } else {
              // If within minimum distance, no movement
              translateX = 0;
              translateY = 0;
            }
          }

          transformValue = `translate(${translateX}px, ${translateY}px)`;
          break;

        case "rotate":
          let rotateAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

          if (interactionType === "repulsion") {
            rotateAngle += 180;
          }

          rotateAngle = ((rotateAngle % 360) + 360) % 360;

          const targetAngle = rotateAngle;
          const currentTransform = this.initialTransform;
          let currentAngle = 0;

          const match = currentTransform.match(/rotate\(([-\d.]+)deg\)/);
          if (match) {
            currentAngle = parseFloat(match[1]);
          }

          let deltaAngle = targetAngle - currentAngle;
          deltaAngle = ((deltaAngle + 180) % 360) - 180;

          rotateAngle = currentAngle + deltaAngle * factor;

          transformValue = `rotate(${rotateAngle}deg)`;
          break;

        case "scale":
          if (interactionType === "repulsion") {
            const scaleFactor = 1 - (this.options.strength / 100) * factor;
            transformValue = `scale(${scaleFactor})`;
          } else {
            const scaleFactor = 1 + (this.options.strength / 100) * factor;
            transformValue = `scale(${scaleFactor})`;
          }
          break;

        default:
          break;
      }

      this.element.style.transform =
        `${this.initialTransform} ${transformValue}`.trim();
    } else {
      this.element.style.transform = this.initialTransform;
    }
  }

  private animate() {
    this.applyTransform();
    this.animationId = requestAnimationFrame(() => this.animate());
  }

  public destroy() {
    window.removeEventListener("mousemove", this.onMouseMove);
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

export default KinesisDistanceItem;

"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Valor (na escala de min/max) onde desenhar uma linha vertical tracejada — ex: a marca dos 100% num slider de volume/ganho. */
  markValue?: number
  /** Gruda o thumb no markValue quando o arraste chega perto dele, em vez de deixar passar direto. */
  snapToMark?: boolean
}

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, markValue, snapToMark, min = 0, max = 100, onValueChange, ...props }, ref) => {
    const markPercent = markValue !== undefined ? ((markValue - min) / (max - min)) * 100 : null

    const handleValueChange = (values: number[]) => {
      if (!snapToMark || markValue === undefined) {
        onValueChange?.(values)
        return
      }
      const snapThreshold = (max - min) * 0.03
      onValueChange?.(values.map((value) => (Math.abs(value - markValue) <= snapThreshold ? markValue : value)))
    }

    return (
      <SliderPrimitive.Root
        ref={ref}
        data-slot="slider"
        min={min}
        max={max}
        onValueChange={onValueChange ? handleValueChange : undefined}
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track data-slot="slider-track" className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
          <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-primary" />
          {markPercent !== null && (
            <span
              aria-hidden
              data-slot="slider-mark"
              className="absolute top-0 h-full border-l border-dashed border-foreground/50"
              style={{ left: `${markPercent}%` }}
            />
          )}
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        />
      </SliderPrimitive.Root>
    )
  }
)
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }

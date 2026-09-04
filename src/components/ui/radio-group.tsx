"use client"

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"

import { cn } from "@/lib/utils"

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} ref={ref} />
))
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "aspect-square h-4 w-4 shrink-0 rounded-full border border-primary text-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <span className="block h-2 w-2 rounded-full bg-primary" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
))
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

/**
 * Item de SEGMENTO: mesma semântica de rádio (setas do teclado, um só
 * selecionado, `role="radio"`), mas o alvo é o segmento inteiro em vez de uma
 * bolinha ao lado do rótulo.
 *
 * Existe porque o `RadioGroupItem` acima embute o indicador redondo no próprio
 * corpo — não dá pra pedir a ele um segmento sem o ponto dentro. Aqui o
 * conteúdo é o filho, e o estado vira fundo via `data-[state=checked]`.
 */
const RadioGroupSegment = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors",
      "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-sm",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    {children}
  </RadioGroupPrimitive.Item>
))
RadioGroupSegment.displayName = "RadioGroupSegment"

export { RadioGroup, RadioGroupItem, RadioGroupSegment }

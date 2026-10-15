"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

// Palette de commandes (cmdk). Lot 3 du design v4 : champ large (56 px), titres de groupe lisibles séparés par un filet,
// résultat actif sur `surface-3` avec un trait accent de 3 px (arrondi selon le thème).

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn("flex w-full flex-col overflow-hidden bg-surface text-fg", className)}
      {...props}
    />
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4">
      <Search className="size-5 shrink-0 text-fg-muted" aria-hidden />
      <CommandPrimitive.Input
        className={cn(
          "h-14 w-full min-w-0 bg-transparent text-body-lg outline-none placeholder:text-fg-subtle",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-80 scroll-py-2 overflow-y-auto px-1.5 py-1", className)}
      {...props}
    />
  );
}

function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-8 text-center text-body text-fg-muted" {...props} />;
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        "py-1 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border [&_[cmdk-group-heading]]:label-mono [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex h-control cursor-pointer items-center gap-3 rounded-control px-2.5 text-body select-none data-[selected=true]:bg-surface-3 data-[selected=true]:before:absolute data-[selected=true]:before:top-2 data-[selected=true]:before:bottom-2 data-[selected=true]:before:left-0 data-[selected=true]:before:w-[3px] data-[selected=true]:before:rounded-r-pill data-[selected=true]:before:bg-accent [&_svg]:size-4 [&_svg]:text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList };

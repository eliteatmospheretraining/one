import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";

export function Modal({ open, onOpenChange, title, description, children, maxW = "max-w-lg" }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`${maxW} w-[calc(100vw-2rem)] bg-mid border border-subtle rounded-[2px] p-0 text-paper`}
            >
                <DialogHeader className="px-6 pt-6 pb-3">
                    <DialogTitle asChild>
                        <h2 className="font-thunder uppercase text-2xl tracking-tight" style={{ fontWeight: 500 }}>{title}</h2>
                    </DialogTitle>
                    <DialogDescription className="sr-only">{description || title}</DialogDescription>
                </DialogHeader>
                <div className="px-6 pb-6 max-h-[70vh] overflow-y-auto">{children}</div>
            </DialogContent>
        </Dialog>
    );
}

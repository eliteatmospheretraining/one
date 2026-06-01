import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export function Modal({ open, onOpenChange, title, children, maxW = "max-w-lg" }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`${maxW} w-[calc(100vw-2rem)] bg-white border-2 border-obsidian rounded-none p-0 shadow-brut`}
            >
                <DialogHeader className="p-5 border-b-2 border-obsidian">
                    <DialogTitle className="font-heading text-2xl uppercase tracking-tight">{title}</DialogTitle>
                </DialogHeader>
                <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
            </DialogContent>
        </Dialog>
    );
}

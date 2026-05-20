import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-background text-foreground border-border shadow-lg",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground"
        }
      }}
      {...props}
    />
  );
}

export { toast } from "sonner";

import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "DateBloom | Tampa",
  description: "Tell us your budget and when you are free. We arrange the date. You show up.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

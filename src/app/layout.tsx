import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Vazirmatn, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-vazirmatn",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "آوانگار StyleTTS 2 | سیستم لوکال تبدیل متن به گفتار عصبی دوزبانه (B2B)",
  description:
    "پلتفرم سازمانی و ۱۰۰٪ آفلاین تبدیل متن به گفتار عصبی دوزبانه (فارسی + انگلیسی بومی + اعداد دقیق) بر پایه StyleTTS 2 با Style Diffusion، PL-BERT، WavLM SLM، کلونینگ بردار استایل ref_s و ویجت جاوااسکریپت ویژه رسانه‌ها.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-[#f8f9fb] text-slate-900 antialiased selection:bg-teal-600/15 selection:text-teal-900">
        {children}
      </body>
    </html>
  );
}

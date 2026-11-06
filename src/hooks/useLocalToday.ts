"use client";

import { useEffect, useState } from "react";
import { todayKey } from "@/utility/dates";

export function useLocalToday() {
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function update() {
      setToday(todayKey());
      clearTimeout(timer);
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, tomorrow.getTime() - now.getTime() + 100);
    }
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearTimeout(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  return today;
}

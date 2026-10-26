"use client";
import Link from "next/link";
import { Radar } from "lucide-react";
import Lookups from "@/components/Lookups";
export default function Page() { return <div className="stack"><Link href="/agent/intel" className="receipt row" style={{ textDecoration: "none" }}><Radar size={16} /> New: Customer 360 runs every lookup at once →</Link><Lookups /></div>; }

"use client";
import Link from "next/link";
import { Radar } from "lucide-react";
import Lookups from "@/components/Lookups";
import LookupUrls from "@/components/admin/LookupUrls";
export default function Page() { return <div className="stack"><Link href="/admin/intel" className="receipt row" style={{ textDecoration: "none" }}><Radar size={16} /> New: Customer 360 runs every lookup at once — carrier, safe call hours, address, neighbourhood, utility, internet, email and IMEI →</Link><Lookups /><LookupUrls /></div>; }

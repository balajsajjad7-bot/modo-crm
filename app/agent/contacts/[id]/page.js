"use client";
import { ContactDetail } from "@/components/crm/Contacts";
export default function Page({ params }) { return <ContactDetail id={params.id} />; }

import { NextResponse } from "next/server";
import { listEnvironments, createEnvironment } from "@/lib/workspace";

export async function GET() {
  const environments = await listEnvironments();
  return NextResponse.json(environments);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, variables } = body;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const environment = await createEnvironment(name, variables);
  return NextResponse.json(environment, { status: 201 });
}

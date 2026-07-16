import { apiError } from "@/lib/api-response";

export function GET() {
  return apiError("API endpoint not found", 404, "NOT_FOUND");
}
export function POST() {
  return apiError("API endpoint not found", 404, "NOT_FOUND");
}
export function PUT() {
  return apiError("API endpoint not found", 404, "NOT_FOUND");
}
export function PATCH() {
  return apiError("API endpoint not found", 404, "NOT_FOUND");
}
export function DELETE() {
  return apiError("API endpoint not found", 404, "NOT_FOUND");
}

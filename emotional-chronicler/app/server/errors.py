"""Standard API error models and exception handlers.

All HTTP errors are returned as:
  {"error": {"code": "<machine_code>", "message": "<human_message>"}}
"""

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_CODE_MAP = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "too_many_requests",
    500: "internal_error",
    503: "service_unavailable",
}


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    """Build a standard error JSONResponse."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle all HTTPExceptions with the standard error envelope."""
    code = _CODE_MAP.get(exc.status_code, "error")
    return error_response(code, str(exc.detail), exc.status_code)


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle Pydantic RequestValidationError (422) with the standard error envelope."""
    errors = exc.errors()
    if errors:
        first = errors[0]
        field = ".".join(str(loc) for loc in first.get("loc", []))
        message = f"{field}: {first.get('msg', 'validation error')}" if field else first.get("msg", "Validation error")
    else:
        message = "Validation error"
    return error_response("validation_error", message, 422)

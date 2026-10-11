async function parse<TResponse>(response: Response): Promise<TResponse> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {}
  if (!response.ok) {
    const message = (data as { message?: string } | null)?.message;
    throw new Error(message ?? `HTTP error! Status: ${response.status}`);
  }
  return data as TResponse;
}

export async function POST<TPayload, TResponse>(url: string, payload: TPayload): Promise<TResponse> {
  return parse(
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
}

export async function PATCH<TPayload, TResponse>(url: string, payload: TPayload): Promise<TResponse> {
  return parse(
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  );
}

export async function DELETE<TPayload, TResponse>(url: string, payload?: TPayload): Promise<TResponse> {
  return parse(
    await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    })
  );
}

export async function GET<TResponse>(url: string): Promise<TResponse> {
  return parse(await fetch(url));
}

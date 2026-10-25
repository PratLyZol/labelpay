export const MEMO_PROGRAM_ADDRESS = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export function projectDepositMemo(projectId: string) {
  return `labelpay:${projectId}`;
}

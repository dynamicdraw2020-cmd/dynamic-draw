export const TEMPORARY_PASSWORD = process.env.DYNAMICD_TEMP_PASSWORD?.trim() || "DynamicD2026!reset";
export const TEMP_RESET_PASSWORD = TEMPORARY_PASSWORD;

export function isTemporaryPassword(value: unknown) {
  return String(value ?? "") === TEMPORARY_PASSWORD;
}

export function mustChangePassword(profile: { must_change_password?: boolean | null; password_changed_at?: string | null } | null | undefined) {
  return profile?.must_change_password === true && !profile.password_changed_at;
}

export function publicResetNotice() {
  return {
    title: "비밀번호가 초기화되었습니다.",
    message: "관리자에 의해 비밀번호가 초기화되었습니다. 아래 임시 비밀번호로 로그인한 뒤 반드시 새 비밀번호로 변경해 주세요.",
    temporaryPassword: TEMPORARY_PASSWORD,
  };
}

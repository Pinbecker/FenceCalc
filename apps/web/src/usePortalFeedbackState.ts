import { useCallback, useState } from "react";

export function usePortalFeedbackState() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const clearMessages = useCallback(() => {
    setErrorMessage(null);
    setNoticeMessage(null);
  }, []);

  return {
    errorMessage,
    noticeMessage,
    setErrorMessage,
    setNoticeMessage,
    clearMessages
  };
}

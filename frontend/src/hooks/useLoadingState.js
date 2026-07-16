import { useEffect, useState } from "react";

export function useLoadingState(initialValue = false) {
  const [isLoading, setIsLoading] = useState(initialValue);

  useEffect(() => {
    return () => setIsLoading(false);
  }, []);

  return [isLoading, setIsLoading];
}

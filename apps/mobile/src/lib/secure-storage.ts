import * as SecureStore from 'expo-secure-store';

// 인증 구현 시 사용합니다. 현재 로그인/토큰 발급 API는 제공하지 않습니다.
const REFRESH_TOKEN_KEY = 'chat.refresh-token';
export const secureStorage = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
  clearRefreshToken: () => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
};

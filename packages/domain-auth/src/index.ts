export { hashPassword, verifyPassword } from "./password.js";
export {
  type TokenConfig,
  type AccessClaims,
  type RefreshClaims,
  type IssuedTokens,
  defaultTokenTtl,
  signAccessToken,
  signRefreshToken,
  issueTokenPair,
  verifyRefreshToken,
} from "./tokens.js";
export {
  type RefreshRecord,
  type RefreshTokenStore,
  inMemoryRefreshStore,
  redisRefreshStore,
} from "./refresh-store.js";
export {
  type OAuthProvider,
  type OAuthIdentity,
  verifyGoogleIdToken,
  verifyDiscordAccessToken,
} from "./oauth.js";
export {
  type OneShotPurpose,
  type OneShotRecord,
  type OneShotTokenStore,
  generateOneShotToken,
  inMemoryOneShotStore,
  redisOneShotStore,
} from "./token-store.js";
export {
  type Mailer,
  type MailMessage,
  type ResendOptions,
  consoleMailer,
  resendMailer,
} from "./mailer.js";
export {
  AuthService,
  type AuthDeps,
  type AuthMysqlClient,
  type AuthSessionResult,
  type OAuthConfig,
  type PasswordResetConfig,
  type EmailVerificationConfig,
  type SignupInput,
  type LoginInput,
  type OAuthLoginInput,
  type OAuthGoogleInput,
  type OAuthDiscordInput,
  type RefreshInput,
  type LogoutInput,
  type RequestPasswordResetInput,
  type ConfirmPasswordResetInput,
  type RequestEmailVerificationInput,
  type ConfirmEmailVerificationInput,
} from "./service.js";
export { createAuthRouter, type AuthRouter } from "./router.js";

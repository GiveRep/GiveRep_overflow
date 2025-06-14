// @/utils/signatureUtils.ts
export const checkSignatureDateValid = (
  signInSignatureMessage: string
): boolean => {
  const timestamp = signInSignatureMessage
    .replace("I'm using GiftDrop at ", "")
    .split(".")[0];
  const signatureDate = new Date(timestamp);
  const now = new Date();
  const hoursDiff =
    (now.getTime() - signatureDate.getTime()) / (1000 * 60 * 60);
  return hoursDiff <= 24;
};

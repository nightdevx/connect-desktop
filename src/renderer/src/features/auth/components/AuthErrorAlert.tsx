import { Alert } from "antd";
import type { ApiErrorPayload } from "@shared/desktop-api-types";
import { describeAuthError } from "../auth-error-messages";

interface AuthErrorAlertProps {
  error: ApiErrorPayload | null;
  context: "login" | "register";
}

// Sits above the form, not in the app's status bar. The status bar is a strip
// at the edge of the window that says one line and is easy to miss; a failed
// sign-in needs to say what went wrong where the person is already looking, and
// next to the field they have to change.
export function AuthErrorAlert({
  error,
  context,
}: AuthErrorAlertProps): JSX.Element | null {
  if (!error) {
    return null;
  }

  const info = describeAuthError(error, context);

  return (
    <Alert
      type="error"
      showIcon
      className="ct-auth-error"
      message={info.title}
      description={
        <div className="ct-auth-error-body">
          <p>{info.detail}</p>
          {info.hint && <p className="ct-auth-error-hint">{info.hint}</p>}

          {/* Only for the failures the user cannot fix themselves. On a wrong
              password the code adds noise; on a server fault it is the one
              thing worth quoting when reporting it. */}
          {!info.field && error.code && (
            <p className="ct-auth-error-code">Hata kodu: {error.code}</p>
          )}
        </div>
      }
    />
  );
}

import { createBrowserRouter } from "react-router-dom";
import IMProtectedRoute from "../component/IMProtectedRoute";
import IMLogin from "../pages/IMLogin";
import IMMainLayout from "../component/IMMainLayout";

// Each page is its own chunk, downloaded when first visited, instead of the
// whole app (including the spreadsheet library) before the login page shows.
const page = (load) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <IMLogin />,
  },
  {
    element: (
      <IMProtectedRoute>
        <IMMainLayout />
      </IMProtectedRoute>
    ),
    children: [
      {
        path: "/",
        lazy: page(() => import("../pages/IMHome")),
      },
      {
        path: "/dcr",
        lazy: page(() => import("../pages/IMUpload")),
      },
      {
        path: "/bank-mapping",
        lazy: page(() => import("../pages/IMBankMapping")),
      },
      {
        path: "/store-names",
        lazy: page(() => import("../pages/IMStoreData")),
      },
      {
        path: "/due-to-due-mappings",
        lazy: page(() => import("../pages/IMDueToDueMappings")),
      },
      {
        path: "/cheque_sheet-generator",
        lazy: page(() => import("../pages/IMChequeSheetGenerator")),
      },
    ],
  },
]);

import { createBrowserRouter } from "react-router-dom";
import IMHome from "../pages/IMHome";
import IMUpload from "../pages/IMUpload";
import IMProtectedRoute from "../component/IMProtectedRoute";
import IMLogin from "../pages/IMLogin";
import IMMainLayout from "../component/IMMainLayout";
import IMBankMapping from "../pages/IMBankMapping";
import IMStoreData from "../pages/IMStoreData";
import IMDueToDueMappings from "../pages/IMDueToDueMappings";
import IMChequeSheetGenerator from "../pages/IMChequeSheetGenerator";

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
        element: <IMHome />,
      },
      {
        path: "/dcr",
        element: <IMUpload />,
      },
      {
        path: "/bank-mapping",
        element: <IMBankMapping />,
      },
      {
        path: "/store-names",
        element: <IMStoreData />,
      },
      {
        path: "/due-to-due-mappings",
        element: <IMDueToDueMappings />,
      },
      {
        path: "/cheque_sheet-generator",
        element: <IMChequeSheetGenerator />
      }
    ],
  },
]);

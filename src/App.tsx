import { useEffect, useState, useRef, useCallback } from "react";
import useSQLiteStore from "./store/useSQLiteStore";

import DBTable from "./components/table";
import UploadFile from "./components/dropzone";
import Loading from "./components/loading";
import Logo from "./components/logo";
import ErrorMessage from "./components/error";
import Dialog from "./components/dialog";
import Footer from "./components/footer";

function App() {
  const { db, tables, isLoading, loadDatabase, expandPage } = useSQLiteStore();
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [urlToFetch, setUrlToFetch] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const hasFetched = useRef(false);

  const fetchDatabase = useCallback(
    async (url: string, useProxy: boolean = false) => {
      try {
        setIsFetching(true);
        const fetchUrl = useProxy
          ? `https://corsproxy.io/?${encodeURIComponent(url)}`
          : url;
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error("URL not found or invalid");
        }
        const blob = await response.blob();
        const file = new File([blob], "database.sqlite");
        await loadDatabase(file);
        setFetchError(null);
      } catch (error) {
        if (!useProxy) {
          setUrlToFetch(url);
          setShowDialog(true);
        } else {
          setFetchError(
            `Error whilefetching, ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } finally {
        setIsFetching(false);
      }
    },
    [loadDatabase]
  );

  useEffect(() => {
    if (hasFetched.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const url = urlParams.get("url");

    if (url) {
      fetchDatabase(decodeURIComponent(url));
      hasFetched.current = true;
    }
  }, [fetchDatabase]);

  const handleRetryWithProxy = useCallback(() => {
    if (urlToFetch) {
      fetchDatabase(urlToFetch, true);
      setShowDialog(false);
    }
  }, [urlToFetch, fetchDatabase]);

  const renderContent = () => {
    if (isLoading || isFetching) {
      return (
        <Loading>{isFetching ? "Fetching" : "Loading"} SQLite file</Loading>
      );
    }
    if (fetchError && !db) {
      return <ErrorMessage>{fetchError}</ErrorMessage>;
    }
    if (db) {
      return tables.length > 0 ? (
        <DBTable />
      ) : (
        <ErrorMessage>Your database is empty, no tables found</ErrorMessage>
      );
    }
    return null;
  };

  return (
    <main
      className={`mx-auto flex h-screen flex-col gap-3 p-4 ${expandPage ? "w-full" : "container"}`}
    >
      {!db && <Logo />}
      <UploadFile />
      {renderContent()}
      <Dialog
        showDialog={showDialog}
        setShowDialog={setShowDialog}
        fn={handleRetryWithProxy}
      />
      {!db && <Footer />}
    </main>
  );
}

export default App;

import Sqlite, { CustomQueryError } from "./sqlite";

import type {
  DeleteEvent,
  ExecEvent,
  ExportEvent,
  GetTableDataEvent,
  InsertEvent,
  RefreshEvent,
  UpdateEvent,
  WorkerEvent
} from "@/types";

// Global variable to store the database instance
let instance: Sqlite | null = null;

self.onmessage = async (event: MessageEvent<WorkerEvent>) => {
  const { action, payload } = event.data;

  // Create a new database instance
  if (action === "init") {
    instance = await Sqlite.create();

    // Send the initialization response to the main thread
    self.postMessage({
      action: "initComplete",
      payload: {
        tableSchema: instance.tablesSchema,
        indexSchema: instance.indexesSchema,
        currentTable: instance.firstTable
      }
    });

    return;
  }

  // Check if the database instance is initialized
  if (instance === null) {
    // Send the error response to the main thread
    self.postMessage({
      action: "queryError",
      payload: {
        error: {
          message: "Database is not initialized",
          isCustomQueryError: false
        }
      }
    });

    return;
  }

  try {
    // Updates the instance from user-uploaded file
    switch (action) {
      case "openFile": {
        instance = await Sqlite.open(new Uint8Array(payload.file));

        // Send the initialization response to the main thread
        self.postMessage({
          action: "initComplete",
          payload: {
            tableSchema: instance.tablesSchema,
            indexSchema: instance.indexesSchema,
            currentTable: instance.firstTable
          }
        });

        break;
      }
      // Refreshes the current table data
      case "refresh": {
        const { currentTable, limit, offset, filters, sorters } =
          payload as RefreshEvent["payload"];

        const [results, maxSize] = instance.getTableData(
          currentTable,
          limit,
          offset,
          filters,
          sorters
        );

        // Send the refresh response to the main thread
        self.postMessage({
          action: "queryComplete",
          payload: { results, maxSize }
        });

        break;
      }
      // Executes a custom query
      // User for user-typed queries
      case "exec": {
        try {
          const { query, currentTable, limit, offset, filters, sorters } =
            payload as ExecEvent["payload"];

          const [results, doTablesChanged] = instance.exec(query);

          // Check if tables changed (user created/deleted/altered table)
          if (doTablesChanged) {
            // Send the update response to the main thread
            self.postMessage({
              action: "updateInstance",
              payload: {
                tableSchema: instance.tablesSchema,
                indexSchema: instance.indexesSchema
              }
            });
          } else {
            // Check if custom query returned results
            // To render the table data
            if (results.length > 0) {
              // Send the custom query response to the main thread
              self.postMessage({
                action: "customQueryComplete",
                payload: { results }
              });
            }
            // If not return the table data
            // Insert, Update, Delete, ...
            else {
              const [results, maxSize] = instance.getTableData(
                currentTable,
                limit,
                offset,
                filters,
                sorters
              );

              // Send the table data response to the main thread
              self.postMessage({
                action: "queryComplete",
                payload: { results, maxSize }
              });
            }
          }
        } catch (error) {
          // If the query throws an error
          // User for error messages
          if (error instanceof Error) {
            throw new CustomQueryError(error.message);
          }
        }

        break;
      }
      // Gets the table data for the current table/table-options
      case "getTableData": {
        const { currentTable, limit, offset, filters, sorters } =
          payload as GetTableDataEvent["payload"];

        const [results, maxSize] = instance.getTableData(
          currentTable,
          limit,
          offset,
          filters,
          sorters
        );

        // Send the table data response to the main thread
        self.postMessage({
          action: "queryComplete",
          payload: { results, maxSize }
        });

        break;
      }
      // Downloads the database as bytes
      case "download": {
        const bytes = instance.download();

        // Send the download(bytes) response to the main thread
        self.postMessage({
          action: "downloadComplete",
          payload: { bytes }
        });

        break;
      }
      // Updates the values of a row in a table
      case "update": {
        const { table, columns, values, primaryValue } =
          payload as UpdateEvent["payload"];

        instance.update(table, columns, values, primaryValue);

        // Send the update response to the main thread
        self.postMessage({
          action: "updateComplete",
          payload: { type: "updated" }
        });

        break;
      }
      // Deletes a row from a table
      case "delete": {
        const { table, primaryValue } = payload as DeleteEvent["payload"];

        instance.delete(table, primaryValue);

        // Send the delete response to the main thread
        self.postMessage({
          action: "updateComplete",
          payload: { type: "deleted" }
        });

        break;
      }
      // Inserts a row into a table
      case "insert": {
        const { table, columns, values } = payload as InsertEvent["payload"];

        instance.insert(table, columns, values);

        // Send the insert response to the main thread
        self.postMessage({
          action: "insertComplete"
        });

        break;
      }
      // Exports as CSV
      // It have 2 types of exports (table, current data)
      // Current data is the current page of data
      case "export": {
        const { table, filters, sorters, limit, offset, exportType } =
          payload as ExportEvent["payload"];

        let results: string;
        if (exportType === "table") {
          results = instance.getTableAsCsv(table);
        } else {
          results = instance.getCurrentDataAsCsv(
            table,
            limit,
            offset,
            filters,
            sorters
          );
        }

        // Send the export response to the main thread
        self.postMessage({
          action: "exportComplete",
          payload: { results }
        });

        break;
      }
      // Other unhandled actions
      default:
        console.warn("Unknown worker action:", action);
    }
  } catch (error) {
    if (error instanceof Error) {
      // Send the error response to the main thread
      self.postMessage({
        action: "queryError",
        payload: {
          error: {
            message: error.message,
            isCustomQueryError: error instanceof CustomQueryError
          }
        }
      });
    } else {
      // Send the error response to the main thread
      self.postMessage({
        action: "queryError",
        payload: {
          error: { message: "Unknown error", isCustomQueryError: false }
        }
      });
    }
  }
};

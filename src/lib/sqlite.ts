import initSqlJs, { type Database, type QueryExecResult } from "sql.js";
import { saveAs } from "file-saver";

import type { TableRow } from "@/types";

// Load the SQLite database from a file.
export const loadDatabase = async (file: File): Promise<Database> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const SQL = await initSqlJs({
      locateFile: (fileName) => `https://sql.js.org/dist/${fileName}`,
    });
    return new SQL.Database(new Uint8Array(arrayBuffer));
  } catch (error) {
    console.error("Failed to load database:", error);
    throw error;
  }
};

// Get the names of all tables in the database.
export const getTableNames = (database: Database): string[] => {
  try {
    const result = database.exec(
      "SELECT name FROM sqlite_master WHERE type='table';"
    );
    return result[0]?.values.map((row) => row[0] as string) || [];
  } catch (error) {
    console.error("Failed to get table names:", error);
    return [];
  }
};

// Get the schema of a specific table.
export const getTableSchema = async (database: Database, tableName: string) => {
  try {
    const tableInfoResult = database.exec(`PRAGMA table_info("${tableName}")`);
    const tableSchema = tableInfoResult[0].values.reduce((acc, row) => {
      acc[row[1] as string] = {
        type: row[2] as string,
        isPrimaryKey: (row[5] as number) === 1,
        isForeignKey: false,
      };
      return acc;
    }, {} as { [columnName: string]: { type: string; isPrimaryKey: boolean; isForeignKey: boolean } });

    const foreignKeyInfoResult = database.exec(
      `PRAGMA foreign_key_list("${tableName}")`
    );
    if (foreignKeyInfoResult.length > 0) {
      foreignKeyInfoResult[0].values.forEach((row) => {
        const columnName = row[3] as string;
        if (tableSchema[columnName]) {
          tableSchema[columnName].isForeignKey = true;
        }
      });
    }

    return tableSchema;
  } catch (error) {
    console.error(`Failed to get schema for table "${tableName}":`, error);
    throw error;
  }
};

// Map query results to a structured format.
export function mapQueryResults(result: QueryExecResult[]): {
  data: TableRow[];
  columns: string[];
} {
  if (result.length > 0) {
    const columns = result[0].columns;
    const data = result[0].values.map((row) =>
      columns.reduce((acc, col, index) => {
        acc[col] = row[index];
        return acc;
      }, {} as TableRow)
    );
    return { data, columns };
  }
  return { data: [], columns: [] };
}

export const exportDatabase = (database: Database): Uint8Array => {
  try {
    return database.export();
  } catch (error) {
    console.error("Failed to export database:", error);
    throw error;
  }
};

// Function to convert array of rows to CSV format
const arrayToCSV = (columns: string[], rows: any[]): string => {
  const header = columns.join(",");
  const csvRows = rows.map((row) =>
    columns.map((col) => `"${row[col]}"`).join(",")
  );
  return [header, ...csvRows].join("\n");
};

// Export a single table as CSV and initiate download
export const exportTableAsCSV = (
  database: Database,
  tableIndex: number
): void => {
  const tableNames = getTableNames(database);
  const tableName = tableNames[tableIndex];
  try {
    const result = database.exec(`SELECT * FROM ${tableName}`);
    if (result.length === 0) {
      throw new Error(`Table ${tableName} is empty or does not exist.`);
    }
    const { data, columns } = mapQueryResults(result);
    const csvContent = arrayToCSV(columns, data);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `${tableName}.csv`);
  } catch (error) {
    console.error(`Failed to export table "${tableName}" as CSV:`, error);
    throw error;
  }
};

// Export all tables as CSV and initiate download
export const exportAllTablesAsCSV = (database: Database): void => {
  const tableNames = getTableNames(database);

  tableNames.forEach((tableName) => {
    try {
      const result = database.exec(`SELECT * FROM ${tableName}`);
      if (result.length === 0) {
        throw new Error(`Table ${tableName} is empty or does not exist.`);
      }
      const { data, columns } = mapQueryResults(result);
      const csvContent = arrayToCSV(columns, data);
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, `${tableName}.csv`);
    } catch (error) {
      console.error(`Failed to export table "${tableName}" as CSV:`, error);
    }
  });
};

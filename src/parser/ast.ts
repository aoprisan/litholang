// ClarityLang Abstract Syntax Tree node types
// Every node is a discriminated union on the `kind` field.

export interface Position {
  line: number;
  column: number;
}

// ─── Type Nodes ───

export interface SimpleType {
  kind: "SimpleType";
  name: string;
  position: Position;
}

export interface GenericType {
  kind: "GenericType";
  name: string;
  typeArgs: TypeNode[];
  position: Position;
}

export interface FunctionType {
  kind: "FunctionType";
  params: TypeNode[];
  returnType: TypeNode;
  position: Position;
}

export type TypeNode = SimpleType | GenericType | FunctionType;

// ─── Expression Nodes ───

export interface NumberLiteral {
  kind: "NumberLiteral";
  value: number;
  position: Position;
}

export interface TextLiteral {
  kind: "TextLiteral";
  value: string;
  // Interpolation segments for "Hello, {name}!" style strings
  segments: Array<{ text: string } | { expr: Expression }>;
  position: Position;
}

export interface BooleanLiteral {
  kind: "BooleanLiteral";
  value: boolean;
  position: Position;
}

export interface IdentifierExpr {
  kind: "IdentifierExpr";
  name: string;
  position: Position;
}

export interface SelfExpr {
  kind: "SelfExpr";
  position: Position;
}

export interface DotAccess {
  kind: "DotAccess";
  object: Expression;
  field: string;
  position: Position;
}

export interface ShortDotAccess {
  kind: "ShortDotAccess";
  field: string;
  position: Position;
}

export interface CallExpr {
  kind: "CallExpr";
  callee: Expression;
  args: Argument[];
  position: Position;
}

export interface Argument {
  name?: string; // Named argument: `limit: 5`
  value: Expression;
}

export interface BinaryExpr {
  kind: "BinaryExpr";
  operator: string;
  left: Expression;
  right: Expression;
  position: Position;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  operator: string;
  operand: Expression;
  position: Position;
}

export interface PipelineExpr {
  kind: "PipelineExpr";
  source: Expression;
  steps: PipelineStep[];
  position: Position;
}

export interface PipelineStep {
  callee: Expression;
  args: Argument[];
}

export interface LambdaExpr {
  kind: "LambdaExpr";
  params: Parameter[];
  body: Expression;
  position: Position;
}

export interface PropagateExpr {
  kind: "PropagateExpr";
  expr: Expression;
  position: Position;
}

export interface WithExpr {
  kind: "WithExpr";
  base: Expression;
  updates: { field: string; value: Expression }[];
  position: Position;
}

export interface ListLiteral {
  kind: "ListLiteral";
  elements: Expression[];
  position: Position;
}

export interface ConstructExpr {
  kind: "ConstructExpr";
  typeName: string;
  fields: { name: string; value: Expression }[];
  position: Position;
}

export type Expression =
  | NumberLiteral
  | TextLiteral
  | BooleanLiteral
  | IdentifierExpr
  | SelfExpr
  | DotAccess
  | ShortDotAccess
  | CallExpr
  | BinaryExpr
  | UnaryExpr
  | PipelineExpr
  | LambdaExpr
  | PropagateExpr
  | WithExpr
  | ListLiteral
  | ConstructExpr;

// ─── Statement Nodes ───

export interface Assignment {
  kind: "Assignment";
  target: string;
  value: Expression;
  position: Position;
}

export interface ReturnStatement {
  kind: "ReturnStatement";
  value: Expression;
  position: Position;
}

export interface IfStatement {
  kind: "IfStatement";
  condition: Expression;
  thenBlock: Statement[];
  elseIfClauses: { condition: Expression; block: Statement[] }[];
  elseBlock: Statement[] | null;
  position: Position;
}

export interface ForStatement {
  kind: "ForStatement";
  variable: string;
  iterable: Expression;
  body: Statement[];
  position: Position;
}

export interface MatchStatement {
  kind: "MatchStatement";
  subject: Expression;
  cases: MatchCase[];
  position: Position;
}

export interface MatchCase {
  pattern: Pattern;
  body: Expression | Statement[];
}

export interface CheckStatement {
  kind: "CheckStatement";
  condition: Expression;
  fallback: Expression;
  position: Position;
}

export interface ExpressionStatement {
  kind: "ExpressionStatement";
  expr: Expression;
  position: Position;
}

export type Statement =
  | Assignment
  | ReturnStatement
  | IfStatement
  | ForStatement
  | MatchStatement
  | CheckStatement
  | ExpressionStatement;

// ─── Pattern Nodes ───

export interface LiteralPattern {
  kind: "LiteralPattern";
  value: string | number | boolean;
}

export interface IdentifierPattern {
  kind: "IdentifierPattern";
  name: string;
}

export interface TuplePattern {
  kind: "TuplePattern";
  elements: Pattern[];
}

export interface ConstructorPattern {
  kind: "ConstructorPattern";
  name: string;
  inner: Pattern | null;
}

export interface WildcardPattern {
  kind: "WildcardPattern";
}

export type Pattern =
  | LiteralPattern
  | IdentifierPattern
  | TuplePattern
  | ConstructorPattern
  | WildcardPattern;

// ─── Declaration Nodes ───

export interface Parameter {
  name: string;
  type: TypeNode;
  defaultValue?: Expression;
}

export interface FieldDef {
  name: string;
  type: TypeNode;
  defaultValue?: Expression;
}

export interface Annotation {
  name: string; // "purpose", "invariant", "example"
  value: string;
  position: Position;
}

export interface FunctionDef {
  kind: "FunctionDef";
  name: string;
  params: Parameter[];
  returnType: TypeNode | null;
  body: Statement[];
  annotations: Annotation[];
  isAsync: boolean;
  position: Position;
}

export interface StructDef {
  kind: "StructDef";
  name: string;
  fields: FieldDef[];
  methods: FunctionDef[];
  annotations: Annotation[];
  position: Position;
}

export interface EnumDef {
  kind: "EnumDef";
  name: string;
  variants: string[];
  annotations: Annotation[];
  position: Position;
}

export interface TypeAlias {
  kind: "TypeAlias";
  name: string;
  type: TypeNode;
  position: Position;
}

export interface ImportDecl {
  kind: "ImportDecl";
  names: string[];
  source: string;
  position: Position;
}

export type Declaration =
  | FunctionDef
  | StructDef
  | EnumDef
  | TypeAlias
  | ImportDecl;

// ─── Program Root ───

export interface Program {
  kind: "Program";
  declarations: Declaration[];
}

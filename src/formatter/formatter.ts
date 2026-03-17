import {
  Program,
  Declaration,
  FunctionDef,
  StructDef,
  EnumDef,
  TypeAlias,
  ImportDecl,
  ExternDef,
  Statement,
  Expression,
  TypeNode,
  Pattern,
  Annotation,
} from "../parser/ast.js";

/**
 * Formats a LithoLang AST back into canonical source code.
 *
 * Rules:
 * - 2-space indentation inside blocks
 * - One blank line between top-level declarations
 * - Annotations on their own line before the declaration
 * - Long pipelines broken across lines (one |> per line)
 */
export class Formatter {
  private indent = 0;

  format(program: Program): string {
    const parts: string[] = [];
    for (let i = 0; i < program.declarations.length; i++) {
      if (i > 0) parts.push("");
      parts.push(this.formatDeclaration(program.declarations[i]));
    }
    return parts.join("\n") + "\n";
  }

  private pad(): string {
    return "  ".repeat(this.indent);
  }

  private formatDeclaration(decl: Declaration): string {
    switch (decl.kind) {
      case "FunctionDef": return this.formatFunctionDef(decl);
      case "StructDef": return this.formatStructDef(decl);
      case "EnumDef": return this.formatEnumDef(decl);
      case "TypeAlias": return this.formatTypeAlias(decl);
      case "ImportDecl": return this.formatImportDecl(decl);
      case "ExternDef": return this.formatExternDef(decl);
    }
  }

  private formatAnnotations(annotations: Annotation[]): string {
    if (annotations.length === 0) return "";
    return annotations
      .map(a => `${this.pad()}@${a.name}${a.value ? ` "${a.value}"` : ""}`)
      .join("\n") + "\n";
  }

  private formatFunctionDef(func: FunctionDef): string {
    const lines: string[] = [];
    const annots = this.formatAnnotations(func.annotations);
    if (annots) lines.push(annots.trimEnd());

    const asyncPrefix = func.isAsync ? "async " : "";
    const params = func.params
      .map(p => {
        let s = `${p.name}: ${this.formatType(p.type)}`;
        if (p.defaultValue) s += ` = ${this.formatExpression(p.defaultValue)}`;
        return s;
      })
      .join(", ");
    const returnType = func.returnType ? ` -> ${this.formatType(func.returnType)}` : "";

    lines.push(`${this.pad()}${asyncPrefix}define ${func.name}(${params})${returnType} as`);
    this.indent++;
    for (const stmt of func.body) {
      lines.push(this.formatStatement(stmt));
    }
    this.indent--;
    lines.push(`${this.pad()}end`);
    return lines.join("\n");
  }

  private formatStructDef(struct: StructDef): string {
    const lines: string[] = [];
    const annots = this.formatAnnotations(struct.annotations);
    if (annots) lines.push(annots.trimEnd());

    lines.push(`${this.pad()}struct ${struct.name} has`);
    this.indent++;
    for (const field of struct.fields) {
      let line = `${this.pad()}${field.name}: ${this.formatType(field.type)}`;
      if (field.defaultValue) line += ` = ${this.formatExpression(field.defaultValue)}`;
      lines.push(line);
    }
    for (const method of struct.methods) {
      lines.push("");
      lines.push(this.formatFunctionDef(method));
    }
    this.indent--;
    lines.push(`${this.pad()}end`);
    return lines.join("\n");
  }

  private formatEnumDef(enumDef: EnumDef): string {
    const lines: string[] = [];
    const annots = this.formatAnnotations(enumDef.annotations);
    if (annots) lines.push(annots.trimEnd());

    lines.push(`${this.pad()}enum ${enumDef.name} is`);
    this.indent++;
    for (const variant of enumDef.variants) {
      lines.push(`${this.pad()}${variant}`);
    }
    this.indent--;
    lines.push(`${this.pad()}end`);
    return lines.join("\n");
  }

  private formatTypeAlias(alias: TypeAlias): string {
    return `${this.pad()}type ${alias.name} = ${this.formatType(alias.type)}`;
  }

  private formatImportDecl(decl: ImportDecl): string {
    return `${this.pad()}import ${decl.names.join(", ")} from "${decl.source}"`;
  }

  private formatExternDef(decl: ExternDef): string {
    const lines: string[] = [];
    const annots = this.formatAnnotations(decl.annotations);
    if (annots) lines.push(annots.trimEnd());

    const asyncPrefix = decl.isAsync ? "async " : "";
    const params = decl.params
      .map(p => `${p.name}: ${this.formatType(p.type)}`)
      .join(", ");
    const returnType = decl.returnType ? ` -> ${this.formatType(decl.returnType)}` : "";

    lines.push(`${this.pad()}extern ${asyncPrefix}define ${decl.name}(${params})${returnType}`);
    this.indent++;
    lines.push(`${this.pad()}from "${decl.source}"`);
    this.indent--;
    lines.push(`${this.pad()}end`);
    return lines.join("\n");
  }

  private formatStatement(stmt: Statement): string {
    switch (stmt.kind) {
      case "ReturnStatement":
        return `${this.pad()}return ${this.formatExpression(stmt.value)}`;

      case "Assignment":
        return `${this.pad()}${stmt.target} = ${this.formatExpression(stmt.value)}`;

      case "ExpressionStatement":
        return `${this.pad()}${this.formatExpression(stmt.expr)}`;

      case "IfStatement": {
        const lines: string[] = [];
        lines.push(`${this.pad()}if ${this.formatExpression(stmt.condition)} then`);
        this.indent++;
        for (const s of stmt.thenBlock) lines.push(this.formatStatement(s));
        this.indent--;
        for (const clause of stmt.elseIfClauses) {
          lines.push(`${this.pad()}else if ${this.formatExpression(clause.condition)} then`);
          this.indent++;
          for (const s of clause.block) lines.push(this.formatStatement(s));
          this.indent--;
        }
        if (stmt.elseBlock) {
          lines.push(`${this.pad()}else`);
          this.indent++;
          for (const s of stmt.elseBlock) lines.push(this.formatStatement(s));
          this.indent--;
        }
        lines.push(`${this.pad()}end`);
        return lines.join("\n");
      }

      case "ForStatement": {
        const lines: string[] = [];
        lines.push(`${this.pad()}for ${stmt.variable} in ${this.formatExpression(stmt.iterable)} do`);
        this.indent++;
        for (const s of stmt.body) lines.push(this.formatStatement(s));
        this.indent--;
        lines.push(`${this.pad()}end`);
        return lines.join("\n");
      }

      case "MatchStatement": {
        const lines: string[] = [];
        lines.push(`${this.pad()}match ${this.formatExpression(stmt.subject)} on`);
        this.indent++;
        for (const c of stmt.cases) {
          let caseLine = `${this.pad()}case ${this.formatPattern(c.pattern)}`;
          if (c.guard) caseLine += ` where ${this.formatExpression(c.guard)}`;
          caseLine += " =>";
          if (Array.isArray(c.body)) {
            lines.push(caseLine);
            this.indent++;
            for (const s of c.body) lines.push(this.formatStatement(s));
            this.indent--;
          } else {
            lines.push(`${caseLine} ${this.formatExpression(c.body)}`);
          }
        }
        this.indent--;
        lines.push(`${this.pad()}end`);
        return lines.join("\n");
      }

      case "CheckStatement":
        return `${this.pad()}check ${this.formatExpression(stmt.condition)} or return ${this.formatExpression(stmt.fallback)}`;
    }
  }

  private formatPattern(pattern: Pattern): string {
    switch (pattern.kind) {
      case "WildcardPattern": return "_";
      case "LiteralPattern":
        return typeof pattern.value === "string"
          ? `"${pattern.value}"`
          : String(pattern.value);
      case "IdentifierPattern": return pattern.name;
      case "TuplePattern":
        return `(${pattern.elements.map(e => this.formatPattern(e)).join(", ")})`;
      case "ConstructorPattern":
        return pattern.inner
          ? `${pattern.name}(${this.formatPattern(pattern.inner)})`
          : pattern.name;
    }
  }

  formatExpression(expr: Expression): string {
    switch (expr.kind) {
      case "NumberLiteral": return String(expr.value);
      case "TextLiteral": return `"${expr.value}"`;
      case "BooleanLiteral": return String(expr.value);
      case "IdentifierExpr": return expr.name;
      case "SelfExpr": return "self";
      case "ShortDotAccess": return `.${expr.field}`;
      case "DotAccess":
        return `${this.formatExpression(expr.object)}.${expr.field}`;

      case "CallExpr": {
        const callee = this.formatExpression(expr.callee);
        const args = expr.args.map(a =>
          a.name ? `${a.name}: ${this.formatExpression(a.value)}` : this.formatExpression(a.value)
        ).join(", ");
        return `${callee}(${args})`;
      }

      case "BinaryExpr": {
        const left = this.formatExpression(expr.left);
        const right = this.formatExpression(expr.right);
        return `${left} ${expr.operator} ${right}`;
      }

      case "UnaryExpr":
        return `${expr.operator} ${this.formatExpression(expr.operand)}`;

      case "PipelineExpr": {
        const source = this.formatExpression(expr.source);
        const steps = expr.steps.map(s => {
          const callee = this.formatExpression(s.callee);
          if (s.args.length === 0) return callee;
          const args = s.args.map(a =>
            a.name ? `${a.name}: ${this.formatExpression(a.value)}` : this.formatExpression(a.value)
          ).join(", ");
          return `${callee}(${args})`;
        });
        // Break across lines if pipeline has multiple steps
        if (steps.length > 1) {
          const pad = this.pad() + "  ";
          return `${source}\n${steps.map(s => `${pad}|> ${s}`).join("\n")}`;
        }
        return `${source} |> ${steps[0]}`;
      }

      case "LambdaExpr": {
        const params = expr.params.map(p => p.name).join(", ");
        return `each ${params} => ${this.formatExpression(expr.body)}`;
      }

      case "PropagateExpr":
        return `${this.formatExpression(expr.expr)}?`;

      case "WithExpr": {
        const base = this.formatExpression(expr.base);
        const updates = expr.updates
          .map(u => `${u.field}: ${this.formatExpression(u.value)}`)
          .join(", ");
        return `${base} with ${updates}`;
      }

      case "ListLiteral": {
        const elements = expr.elements.map(e => this.formatExpression(e)).join(", ");
        return `[${elements}]`;
      }

      case "TupleExpr": {
        const elements = expr.elements.map(e => this.formatExpression(e)).join(", ");
        return `(${elements})`;
      }

      case "ConstructExpr": {
        const fields = expr.fields
          .map(f => `${f.name}: ${this.formatExpression(f.value)}`)
          .join(", ");
        return `${expr.typeName}(${fields})`;
      }

      case "AwaitExpr":
        return `await ${this.formatExpression(expr.expr)}`;

      case "AllExpr": {
        const exprs = expr.exprs.map(e => this.formatExpression(e)).join(", ");
        return `all [${exprs}]`;
      }
    }
  }

  formatType(type: TypeNode): string {
    switch (type.kind) {
      case "SimpleType": return type.name;
      case "GenericType": {
        const args = type.typeArgs.map(a => this.formatType(a)).join(", ");
        return `${type.name}<${args}>`;
      }
      case "FunctionType": {
        const params = type.params.map(p => this.formatType(p)).join(", ");
        return `(${params}) -> ${this.formatType(type.returnType)}`;
      }
    }
  }
}

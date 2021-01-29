import { ExpressionVisitor } from "./visitor";

export function typeCheck(cst, rootType) {
  class TypeChecker extends ExpressionVisitor {
    constructor() {
      super();
      this.typeStack = [rootType];
    }

    expression(ctx) {
      this.typeStack.unshift(rootType);
      const result = super.expression(ctx);
      this.typeStack.shift();
      return result;
    }
    aggregation(ctx) {
      this.typeStack.unshift("aggregation");
      const result = super.aggregation(ctx);
      this.typeStack.shift();
      return result;
    }
    boolean(ctx) {
      this.typeStack.unshift("boolean");
      const result = super.boolean(ctx);
      this.typeStack.shift();
      return result;
    }

    logicalOrExpression(ctx) {
      const type = ctx.operands.length > 1 ? "boolean" : this.typeStack[0];
      this.typeStack.unshift(type);
      const result = super.logicalOrExpression(ctx);
      this.typeStack.shift();
      return result;
    }
    logicalAndExpression(ctx) {
      const type = ctx.operands.length > 1 ? "boolean" : this.typeStack[0];
      this.typeStack.unshift(type);
      const result = super.logicalAndExpression(ctx);
      this.typeStack.shift();
      return result;
    }
    logicalNotExpression(ctx) {
      this.typeStack.unshift("boolean");
      const result = super.logicalNotExpression(ctx);
      this.typeStack.shift();
      return result;
    }
    relationalExpression(ctx) {
      const type = ctx.operands.length > 1 ? "expression" : this.typeStack[0];
      this.typeStack.unshift(type);
      const result = super.relationalExpression(ctx);
      this.typeStack.shift();
      return result;
    }

    // TODO check for matching argument signature
    functionExpression(ctx) {
      const args = ctx.arguments || [];
      return args.map(arg => {
        this.typeStack.unshift("expression");
        const result = this.visit(arg);
        this.typeStack.unshift();
        return result;
      });
    }

    dimensionExpression(ctx) {
      const type = this.typeStack[0];
      if (type === "aggregation") {
        ctx.resolveAs = "metric";
      } else if (type === "boolean") {
        ctx.resolveAs = "segment";
      } else {
        ctx.resolveAs = "dimension";
        if (type === "aggregation") {
          throw new Error("Incorrect type for dimension");
        }
      }
      return super.dimensionExpression(ctx);
    }
  }
  new TypeChecker().visit(cst);
}

/*

  Create a copy of the syntax tree where the unnecessary intermediate nodes
  are not present anymore.

  Example:
  For a simple expression "42", the syntax tree produced by the parser is

  expression <-- this is the root node
    relationalExpression
      additionExpression
        multiplicationExpression
          atomicExpression
            numberLiteral

  Meanwhile, the compact variant of the syntax tree:

    numberLiteral

*/

export function compactSyntaxTree(node) {
  if (!node) {
    return;
  }
  const { name, children } = node;
  let result = { name, children };

  switch (name) {
    case "any":
    case "atomicExpression":
    case "boolean":
    case "booleanExpression":
    case "string":
      {
        const expression = children.expression.map(compactSyntaxTree);
        result =
          expression.length === 1
            ? expression[0]
            : { name, children: { expression: expression } };
      }
      break;
    case "additionExpression":
    case "multiplicationExpression":
    case "logicalAndExpression":
    case "logicalOrExpression":
    case "relationalExpression":
      {
        const operands = children.operands.map(compactSyntaxTree);
        const operators = children.operators;
        result =
          operands.length === 1
            ? operands[0]
            : { name, children: { operators, operands } };
      }
      break;

    case "functionExpression":
      {
        const { functionName, LParen, RParen } = children;
        const args = children.arguments.map(compactSyntaxTree);
        result = {
          name,
          children: { functionName, arguments: args, LParen, RParen },
        };
      }
      break;

    case "expression":
    case "booleanUnaryExpression":
    case "parenthesisExpression":
      {
        const expression = children.expression.map(compactSyntaxTree);
        result = expression[0];
      }
      break;

    case "logicalNotExpression":
      {
        const operands = children.operands.map(compactSyntaxTree);
        const operators = children.operators;
        result = { name, children: { operators, operands } };
      }
      break;
    default:
      break;
  }

  return result;
}
